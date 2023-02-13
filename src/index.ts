import { BaileysEventMap, WASocket, jidNormalizedUser, proto } from '@adiwajshing/baileys'
import { Connection, Schema } from 'mongoose'

export enum ConversationType {
  TEXT = 'text',
}

export type ConversationMessageText = {
  id: string
  type: ConversationType.TEXT
  content: string
  timestamp: number
}

export type ConversationMessage = ConversationMessageText

export type Conversation = {
  recipientId: string
  senderId: string
  messages: ConversationMessage[]
}

const ConversationSchema = new Schema({
  recipientId: {
    type: String,
    required: true,
  },
  senderId: {
    type: String,
    required: true,
  },
  messages: {
    type: [
      {
        id: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Number,
          required: true,
        },
      },
    ],
    required: true,
    default: [],
  },
})

export type ConversationOptions = {
  /** List of JIDs to blacklist, so that the conversation will not be saved */
  ignoreJids: string[]
  /** Ignore messages from me */
  ignoreFromMe: boolean
  /** Ignore messages that match this function */
  ignoreMessage: (message: proto.IWebMessageInfo) => boolean
}

export const useMongoConversation = (connection: Connection, options?: Partial<ConversationOptions>) => {
  let socket: WASocket | undefined
  const { ignoreJids = [], ignoreFromMe = false, ignoreMessage = (_: proto.IWebMessageInfo) => false } = options || {}

  const model = connection.models.Conversation || connection.model<Conversation>('Conversation', ConversationSchema)

  const saveData = async (data: Conversation) => {
    const { messages } = data
    if (!messages.length) {
      return
    }

    const saveOptions = { upsert: true }
    const saveCondition: Partial<Conversation> = {
      recipientId: data.recipientId,
      senderId: data.senderId,
    }
    const saveValue = {
      $push: {
        messages: messages[0],
      },
    }
    return model.updateOne(saveCondition, saveValue, saveOptions)
  }

  const mapConversation = (message: proto.IWebMessageInfo): Conversation => {
    const { key, message: messageContent } = message
    const { remoteJid } = key

    let content = ''
    // only save message with type conversation (text only)
    if (messageContent?.conversation) {
      content = messageContent.conversation
    } else if (messageContent?.extendedTextMessage) {
      content = messageContent.extendedTextMessage.text || ''
    }

    const messageToBeSaved: ConversationMessageText = {
      id: message.key.id || '',
      type: ConversationType.TEXT,
      content: content,
      timestamp: +(message.messageTimestamp || 0),
    }

    return {
      recipientId: jidNormalizedUser(remoteJid!),
      senderId: socket!.user!.id,
      messages: content ? [messageToBeSaved] : [],
    }
  }

  const messageUpsertHandler = async (upsert: BaileysEventMap['messages.upsert']) => {
    const { messages, type } = upsert
    const tasks: any[] = []

    if (!['append', 'notify'].includes(type)) {
      return
    }

    for (const message of messages) {
      const jid = jidNormalizedUser(message.key.remoteJid!)
      if (ignoreJids.includes(jid)) {
        continue
      }
      if (ignoreFromMe && message.key.fromMe) {
        continue
      }
      if (ignoreMessage(message)) {
        continue
      }

      const conversation = mapConversation(message)
      tasks.push(saveData(conversation))
    }

    await Promise.all(tasks)
  }

  const handler = (target: any) => {
    socket = target
    socket!.ev.process(async events => {
      if (events['messages.upsert']) {
        await messageUpsertHandler(events['messages.upsert'])
      }
    })
  }

  return {
    binding: handler,
  }
}
