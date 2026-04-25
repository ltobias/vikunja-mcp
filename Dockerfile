FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY index.js .

ENV VIKUNJA_URL=http://vikunja:3456
ENV VIKUNJA_TOKEN=your_token_here
ENV MCP_AUTH_TOKEN=change_this_secret

EXPOSE 3000

CMD ["node", "index.js"]
