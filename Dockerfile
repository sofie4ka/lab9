FROM node:14

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

# Install fluent-logger
RUN npm install fluent-logger

COPY . .

EXPOSE 3000

CMD [ "node", "app.js" ]


