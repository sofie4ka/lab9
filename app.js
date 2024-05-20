const uuid = require('uuid');
const express = require('express');
const cookieParser = require('cookie-parser');
const onFinished = require('on-finished');
const bodyParser = require('body-parser');
const path = require('path');
const port = 3000;
const fs = require('fs');
const fluentd = require('fluent-logger');

// Fluentd configuration
fluentd.configure('app', {
    host: 'fluentd', // Docker service name
    port: 24224,
    timeout: 3.0,
    reconnectInterval: 600000 // 10 minutes
});

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const SESSION_KEY = 'session';

class Session {
    #sessions = {}

    constructor() {
        try {
            this.#sessions = fs.readFileSync('./sessions.json', 'utf8');
            this.#sessions = JSON.parse(this.#sessions.trim());

            console.log(this.#sessions);
        } catch(e) {
            this.#sessions = {};
        }
    }

    #storeSessions() {
        fs.writeFileSync('./sessions.json', JSON.stringify(this.#sessions), 'utf-8');
    }

    set(key, value) {
        if (!value) {
            value = {};
        }
        this.#sessions[key] = value;
        this.#storeSessions();
    }

    get(key) {
        return this.#sessions[key];
    }

    init(res) {
        const sessionId = uuid.v4();
        res.set('Set-Cookie', `${SESSION_KEY}=${sessionId}; HttpOnly`);
        this.set(sessionId);

        return sessionId;
    }

    destroy(req, res) {
        const sessionId = req.sessionId;
        delete this.#sessions[sessionId];
        this.#storeSessions();
        res.set('Set-Cookie', `${SESSION_KEY}=; HttpOnly`);
    }
}

const sessions = new Session();

app.use((req, res, next) => {
    let currentSession = {};
    let sessionId;

    if (req.cookies[SESSION_KEY]) {
        sessionId = req.cookies[SESSION_KEY];
        currentSession = sessions.get(sessionId);
        if (!currentSession) {
            currentSession = {};
            sessionId = sessions.init(res);
        }
    } else {
        sessionId = sessions.init(res);
    }

    req.session = currentSession;
    req.sessionId = sessionId;

    onFinished(req, () => {
        const currentSession = req.session;
        const sessionId = req.sessionId;
        sessions.set(sessionId, currentSession);
    });

    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname + '/frontend/index.html'));
});

app.post('/api/record-click', (req, res) => {
    const { type, message, timestamp } = req.body;

    if (!type || !message || !timestamp) {
        fluentd.emit('click', { message: 'Invalid click data', type, timestamp });
        return res.status(400).send();
    }

    fluentd.emit('click', { message, type, timestamp, session: req.session });

    res.status(200).send();
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
