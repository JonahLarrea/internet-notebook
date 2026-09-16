const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));


// --------------------------------
// STORAGE
// --------------------------------

const DATA_FILE =
    path.join(__dirname, "notebook-data.json");

let documentChars = [];


// --------------------------------
// LOAD SAVED NOTEBOOK
// --------------------------------

function loadDocument() {

    try {

        if (!fs.existsSync(DATA_FILE)) {

            console.log(
                "No saved Notebook found. Starting empty."
            );

            return;
        }

        const saved =
            fs.readFileSync(
                DATA_FILE,
                "utf8"
            );

        const parsed =
            JSON.parse(saved);

        if (Array.isArray(parsed)) {

            documentChars = parsed;

            console.log(
                "Loaded saved Notebook:",
                documentChars.length,
                "characters"
            );

        }

    } catch (error) {

        console.error(
            "Could not load Notebook:",
            error
        );

    }

}


// --------------------------------
// SAVE NOTEBOOK
// --------------------------------

let saveTimer = null;

function saveDocument() {

    if (saveTimer) {
        return;
    }

    saveTimer = setTimeout(() => {

        saveTimer = null;

        try {

            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(
                    documentChars
                ),
                "utf8"
            );

            console.log(
                "Notebook saved."
            );

        } catch (error) {

            console.error(
                "Could not save Notebook:",
                error
            );

        }

    }, 500);

}


// --------------------------------
// INITIAL LOAD
// --------------------------------

loadDocument();


// --------------------------------
// SEND DOCUMENT
// --------------------------------

function sendDocument(socket) {

    socket.send(
        JSON.stringify({
            type: "document",
            chars: documentChars
        })
    );

}


// --------------------------------
// BROADCAST
// --------------------------------

function broadcast(message) {

    const text =
        JSON.stringify(message);

    wss.clients.forEach(
        (client) => {

            if (
                client.readyState ===
                WebSocket.OPEN
            ) {

                client.send(text);

            }

        }
    );

}


// --------------------------------
// FIND CHARACTER
// --------------------------------

function findIndex(id) {

    if (id === null) {
        return -1;
    }

    return documentChars.findIndex(
        (character) =>
            character.id === id
    );

}


// --------------------------------
// WEBSOCKET CONNECTION
// --------------------------------

wss.on(
    "connection",
    (socket) => {

        console.log(
            "Someone connected."
        );

        socket.userId = null;


        // Give new user
        // the current Notebook.

        sendDocument(socket);


        socket.on(
            "message",
            (rawMessage) => {

                let data;

                try {

                    data =
                        JSON.parse(
                            rawMessage
                        );

                } catch {

                    return;

                }


                // --------------------------------
                // IDENTIFY BROWSER
                // --------------------------------

                if (
                    data.type ===
                    "hello"
                ) {

                    if (
                        typeof data.userId !==
                        "string"
                    ) {

                        return;

                    }

                    socket.userId =
                        data.userId;

                    console.log(
                        "User connected:",
                        socket.userId
                    );

                    return;

                }


                // Don't accept editing
                // before identification.

                if (!socket.userId) {
                    return;
                }


                // --------------------------------
                // INSERT CHARACTER
                // --------------------------------

                if (
                    data.type ===
                    "insert"
                ) {

                    if (
                        typeof data.id !==
                            "string" ||

                        typeof data.char !==
                            "string"
                    ) {

                        return;

                    }

                    if (
                        data.char.length !==
                        1
                    ) {

                        return;

                    }

                    const afterId =
                        data.afterId ??
                        null;


                    // Don't allow
                    // duplicate IDs.

                    if (
                        findIndex(
                            data.id
                        ) !== -1
                    ) {

                        return;

                    }


                    let insertIndex =
                        0;


                    if (
                        afterId !==
                        null
                    ) {

                        const afterIndex =
                            findIndex(
                                afterId
                            );


                        if (
                            afterIndex ===
                            -1
                        ) {

                            sendDocument(
                                socket
                            );

                            return;

                        }


                        insertIndex =
                            afterIndex + 1;

                    }


                    const character = {

                        id:
                            data.id,

                        char:
                            data.char,

                        owner:
                            socket.userId,

                        afterId:
                            afterId

                    };


                    documentChars.splice(
                        insertIndex,
                        0,
                        character
                    );


                    console.log(
                        "Inserted:",
                        JSON.stringify(
                            data.char
                        ),
                        "from",
                        socket.userId
                    );


                    // SAVE

                    saveDocument();


                    // TELL EVERYONE

                    broadcast({

                        type:
                            "insert",

                        character:
                            character

                    });


                    return;

                }


                // --------------------------------
                // DELETE CHARACTER
                // --------------------------------

                if (
                    data.type ===
                    "delete"
                ) {

                    if (
                        typeof data.id !==
                        "string"
                    ) {

                        return;

                    }


                    const index =
                        findIndex(
                            data.id
                        );


                    if (
                        index === -1
                    ) {

                        return;

                    }


                    const character =
                        documentChars[
                            index
                        ];


                    // SERVER-SIDE
                    // OWNERSHIP CHECK

                    if (
                        character.owner !==
                        socket.userId
                    ) {

                        console.log(
                            "BLOCKED deletion by",
                            socket.userId
                        );

                        return;

                    }


                    documentChars.splice(
                        index,
                        1
                    );


                    console.log(
                        "Deleted:",
                        JSON.stringify(
                            character.char
                        )
                    );


                    // SAVE

                    saveDocument();


                    // TELL EVERYONE

                    broadcast({

                        type:
                            "delete",

                        id:
                            character.id

                    });


                    return;

                }

            }
        );


        socket.on(
            "close",
            () => {

                console.log(
                    "Someone disconnected."
                );

            }
        );

    }
);


// --------------------------------
// SERVER
// --------------------------------

const PORT = 3000;

server.listen(
    PORT,
    () => {

        console.log(
            `Internet Notebook running at http://localhost:${PORT}`
        );

    }
);