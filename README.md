# baileys conversation


## Description

This package is for stores baileys conversation to MongoDB.

## Installation

```bash
yarn add baileys-conversation
```

## Usage

```ts
import { useMongoConversation } from 'baileys-conversation'
import mongoose from 'mongoose'
import makeWASocket from '@adiwajshing/baileys'

async function main() {
  await mongoose.connect(process.env.MONGO_URI)

  const connection = mongoose.connection
  await startSocket(connection)
}

async function startSocket(connection) {
  const conversation = useMongoConversation(connection, {
    ignoreFromMe: false,
    ignoreJids: [
      // '6282316512341@s.whatsapp.net'
    ],
    ignoreMessage: (message) => false,
  })

  const sock = makeWASocket({})
  conversation.binding(socket)
  
  // ...
  
  return sock
}

main()
```