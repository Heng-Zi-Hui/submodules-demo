FROM oven/bun:1-alpine
COPY . .
ENV PORT=3000
EXPOSE 3000
USER bun
CMD ["bun", "server.js"]
