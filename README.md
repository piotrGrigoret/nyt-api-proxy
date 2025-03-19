
<div align="center">
  <h1>nyt-api-proxy</h1>
</div>


## 🛠️ Technologies
![NYT Archive API](https://img.shields.io/badge/NYT_Archive_API-D50000?style=for-the-badge&logo=new-york-times&logoColor=white)
### Frontend
https://github.com/piotrGrigoret/NYtimes

### Backend

![Static Badge](https://img.shields.io/badge/https%3A%2F%2Fimg.shields.io%2Fbadge%2Fany_text--blue?logo=javascript&logoColor=%23F7DF1E&label=JavaScript&color=%23F7DF1E&link=https%3A%2F%2Fru.wikipedia.org%2Fwiki%2FJavaScript)
![Static Badge](https://img.shields.io/badge/4.9.4-%230d79f2?logo=TypeScript&label=TypeScript&labelColor=dark-gray)
![Node.js Badge](https://img.shields.io/badge/Node.js-20.17.0-339933?logo=node.js&label=Node.js)
![npm Badge](https://img.shields.io/badge/npm-11.1.0-CB3837?logo=npm&label=npm)
![Axios](https://img.shields.io/badge/axios-1.8.3-5A29E4?logo=axios&logoColor=white)

![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Upstash](https://img.shields.io/badge/Upstash-00E599?style=for-the-badge&logo=upstash&logoColor=black)




## 📌Serverless Application on Vercel with Redis Caching

This guide walks you through setting up a **serverless application** on **Vercel**, using **Redis** for caching, pagination, and sorting. We will also use the **Upstash** service for hosting Redis.

---

## 1. Creating an Account on Vercel

1. Go to [Vercel](https://vercel.com/) and sign up using your **GitHub**, **GitLab**, or **Bitbucket** account.
2. After logging in, create a new project and choose the repository you want to deploy.

---

## 2. Creating an Account on Upstash (for Redis)

1. Go to [Upstash](https://upstash.com/) and sign up.
2. Create a new project in Upstash, and obtain the **URL** and **token** for connecting to Redis.
3. These credentials will be used to interact with Redis for caching data.

---

## 3. Project Structure

In this serverless function, we will interact with an external **API**, apply **pagination** and **sorting** to the data, and cache the responses in **Redis** to improve performance.

### 3.1. Setting Up Redis

To interact with Redis, we will use the **Upstash Redis** client. Redis will serve as a cache to store API responses, reducing the load on the external API and speeding up the response time of the application.

We will initialize Redis with credentials from the Upstash platform and cache the API responses in Redis to ensure faster future requests.

### 3.2. Pagination and Sorting

We will implement **pagination** and **sorting** in the function. The API will return a set of documents, which will be filtered by the requested parameters (e.g., year, month, section), and then sorted by publication date (from newest to oldest).

Pagination will divide the data into pages. Each page will be limited by the number of items specified in the `pageSize` parameter, making it easier to handle large sets of data.

### 3.3. Caching in Redis

Once the data is sorted and filtered, we will store it in **Redis** to avoid re-fetching the data on every request. The cache keys will include query parameters such as year, month, section, and page number, ensuring that each request is served with cached data if available.

If data is not found in the cache, the function will fetch it from the external API, process it, and store the response in Redis for future use. 

### 3.4. Rate Limiting

To prevent excessive API requests, we will implement a **rate limiting** mechanism using Redis. For example, we will limit requests to 10 per minute. This helps protect both the API and Redis from being overwhelmed by too many requests in a short period.

If the rate limit is exceeded, the server will respond with a 429 status code, indicating the client should try again later.

---

## 4. Deploying on Vercel

1. Once you have set up the serverless function with Redis integration and caching, push the changes to your **GitHub** repository.
2. Vercel will automatically deploy the function, and you will receive a URL where you can access the API.

---

## Conclusion

You now have a **serverless application** hosted on **Vercel**, with **Redis** caching and **pagination**. This setup improves performance by caching the data, reducing the number of requests to the external API, and providing a more responsive user experience.

If you have any questions or need further assistance, feel free to reach out!

---


