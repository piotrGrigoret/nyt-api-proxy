import type { VercelRequest, VercelResponse } from "@vercel/node"
import axios from "axios"
import { Redis } from "@upstash/redis"

const API_KEY = process.env.NYT_API_KEY || "your-api-key-here"
const CACHE_TTL = 60 * 60 * 12 // 12 часов
const RATE_LIMIT_CACHE_TTL = 60 // 1 минута для счетчика запросов

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
})



// Функция для фильтрации и уменьшения размера документов
function filterDocumentFields(doc: any) {
  return {
    _id: doc._id,
    headline: doc.headline,
    abstract: doc.abstract,
    web_url: doc.web_url,
    pub_date: doc.pub_date,
    section_name: doc.section_name,
    multimedia: doc.multimedia && doc.multimedia.length ? { url: doc.multimedia[0].url } : null,
  }
}

// Функция для сортировки документов по дате (от новых к старым)
function sortDocumentsByDate(docs: any[]) {
  return [...docs].sort((a, b) => {
    const dateA = new Date(a.pub_date).getTime()
    const dateB = new Date(b.pub_date).getTime()
    return dateB - dateA // Сортировка от новых к старым
  })
}

// Функция для фильтрации документов по секции
function filterDocumentsBySection(docs: any[], section: string) {
  if (section === "GENERAL") {
    return docs // Для общей секции возвращаем все документы
  }

  // Для остальных секций фильтруем по названию секции
  const sectionMapping: Record<string, string[]> = {  
    SCIENCE: ["Science", "Health", "Climate"],
    ENTERTAINMENT: ["Arts", "Movies", "Television", "Theater", "Music", "Books", "Style"],
    TECHNOLOGY: ["Technology", "Personal Tech", "Science"],
    BUSINESS: ["Business", "Economy", "Money", "DealBook", "Markets"],
    HEALTH: ["Health", "Well", "Science"],
    SPORTS: ["Sports"],
  }

  const targetSections = sectionMapping[section] || [section]

  return docs.filter((doc) => {
    const docSection = doc.section_name || ""
    return targetSections.some((s) => docSection.toUpperCase().includes(s.toUpperCase()))
  })
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const { year, month, page = "1", pageSize = "15", section = "GENERAL" } = request.query

  if (!year || !month) {
    return response.status(400).json({
      error: "Missing required parameters: year and month are required",
    })
  }

  const pageNum = Number.parseInt(page as string, 10)
  const pageSizeNum = Number.parseInt(pageSize as string, 10)
  const sectionStr = section as string

  if (isNaN(pageNum) || pageNum < 1 || isNaN(pageSizeNum) || pageSizeNum > 100) {
    return response.status(400).json({
      error: "Invalid pagination parameters: page must be >= 1 and pageSize must be between 1 and 100",
    })
  }

  try {
    // Проверка кеша для данной страницы и секции
    const cacheKey = `nytimes:${year}:${month}:${sectionStr}:${pageNum}:${pageSizeNum}`
    const cachedData = await redis.get(cacheKey)

    if (cachedData) {
      console.log("Cache hit for", cacheKey)
      return response.status(200).json({
        ...cachedData,
        source: "cache",
      })
    }

    console.log("Cache miss for", cacheKey)

    // Проверка лимита запросов к API
    const rateLimitKey = "nytimes:ratelimit"
    const currentRequests = (await redis.get(rateLimitKey)) || 0

    // Лимит в 10 запросов в минуту
    const MAX_REQUESTS_PER_MINUTE = 10

    if (Number(currentRequests) >= MAX_REQUESTS_PER_MINUTE) {
      // Проверяем, есть ли кешированные данные для запрашиваемой секции
      const totalResultsKey = `nytimes:${year}:${month}:${sectionStr}:totalresults`
      const cachedTotalResults = await redis.get(totalResultsKey)
      const maxPageKey = `nytimes:${year}:${month}:${sectionStr}:maxpage`
      const cachedMaxPage = await redis.get(maxPageKey)

      if (cachedTotalResults !== null && cachedMaxPage !== null) {
        const totalResults = Number(cachedTotalResults)
        const totalPages = Number(cachedMaxPage)

        if (pageNum > totalPages) {
          return response.status(400).json({
            error: "Page number exceeds maximum available pages",
            maxPage: totalPages,
          })
        }

        // Проверяем, есть ли кешированные данные для этой конкретной страницы и секции
        const pageKey = `nytimes:${year}:${month}:${sectionStr}:page:${pageNum}:${pageSizeNum}`
        const cachedPageData = await redis.get(pageKey)

        if (cachedPageData) {
          const responseData = {
            items: cachedPageData,
            pagination: {
              currentPage: pageNum,
              pageSize: pageSizeNum,
              totalPages,
              totalResults,
              hasNextPage: pageNum < totalPages,
              hasPrevPage: pageNum > 1,
            },
          }

          return response.status(200).json({
            ...responseData,
            source: "cache-page",
          })
        }
      }

      // Если нет кешированных данных, возвращаем ошибку превышения лимита
      return response.status(429).json({
        error: "Rate limit exceeded. Please try again later.",
        retryAfter: 60, // секунд
      })
    }

    // Увеличиваем счетчик запросов
    await redis.set(rateLimitKey, Number(currentRequests) + 1, { ex: RATE_LIMIT_CACHE_TTL })

    // Делаем запрос к NY Times API
    const url = `https://api.nytimes.com/svc/archive/v1/${year}/${month}.json?api-key=${API_KEY}`
    const nytResponse = await axios.get(url)
    const data = nytResponse.data

    const allDocs = data?.response?.docs || []

    // Фильтруем документы по секции и сортируем по дате
    const filteredDocs = filterDocumentsBySection(allDocs, sectionStr)
    const sortedDocs = sortDocumentsByDate(filteredDocs)

    const totalResults = sortedDocs.length
    const totalPages = Math.ceil(totalResults / pageSizeNum)

    // Сохраняем общее количество результатов и максимальное количество страниц для этой секции
    const totalResultsKey = `nytimes:${year}:${month}:${sectionStr}:totalresults`
    const maxPageKey = `nytimes:${year}:${month}:${sectionStr}:maxpage`

    await redis.set(totalResultsKey, totalResults, { ex: CACHE_TTL })
    await redis.set(maxPageKey, totalPages, { ex: CACHE_TTL })

    if (pageNum > totalPages) {
      return response.status(400).json({
        error: "Page number exceeds maximum available pages",
        maxPage: totalPages,
      })
    }

    // Кешируем несколько страниц для этой секции
    const BATCH_SIZE = 10 // Количество страниц для кеширования за один раз
    const startBatch = Math.max(1, pageNum - Math.floor(BATCH_SIZE / 2))
    const endBatch = Math.min(totalPages, startBatch + BATCH_SIZE - 1)

    for (let i = startBatch; i <= endBatch; i++) {
      const batchStartIndex = (i - 1) * pageSizeNum
      const batchEndIndex = Math.min(batchStartIndex + pageSizeNum, totalResults)
      const batchDocs = sortedDocs.slice(batchStartIndex, batchEndIndex)

      // Фильтруем и уменьшаем размер документов перед сохранением
      const processedBatchDocs = batchDocs.map(filterDocumentFields)

      const pageKey = `nytimes:${year}:${month}:${sectionStr}:page:${i}:${pageSizeNum}`
      await redis.set(pageKey, processedBatchDocs, { ex: CACHE_TTL })
    }

    // Получаем документы для запрашиваемой страницы
    const startIndex = (pageNum - 1) * pageSizeNum
    const endIndex = Math.min(startIndex + pageSizeNum, totalResults)
    const paginatedDocs = sortedDocs.slice(startIndex, endIndex)

    // Фильтруем и уменьшаем размер документов
    const processedData = paginatedDocs.map(filterDocumentFields)

    const responseData = {
      items: processedData,
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalPages,
        totalResults,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    }

    // Кешируем результат для этой страницы и секции
    await redis.set(cacheKey, responseData, { ex: CACHE_TTL })

    return response.status(200).json({
      ...responseData,
      source: "api",
    })
  } catch (error: any) {
    console.error("Error fetching from NY Times API:", error)

    // Проверяем, является ли ошибка ошибкой превышения лимита запросов
    if (error.response && error.response.status === 429) {
      return response.status(429).json({
        error: "Rate limit exceeded for NY Times API",
        message: "Too many requests. Please try again later.",
        retryAfter: error.response.headers["retry-after"] || 60,
      })
    }

    // Проверяем, является ли ошибка ошибкой превышения размера запроса Redis
    if (error.message && error.message.includes("max request size exceeded")) {
      return response.status(500).json({
        error: "Redis cache error",
        message: "The data is too large to be cached. Try reducing the page size.",
      })
    }

    return response.status(500).json({
      error: "Failed to fetch data from NY Times API",
      message: error.message,
    })
  }
}

