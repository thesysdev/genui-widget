# Generative UI Widget

An embeddable chat widget that lets your AI chatbots render rich, interactive UI like buttons, forms, charts, cards and more instead of plain text. Works out of the box with LangGraph/LangChain and n8n.

[![Built with Thesys](https://thesys.dev/built-with-thesys-badge.svg)](https://thesys.dev)

## Features

- 🎨 **Beautiful UI** - Clean, modern chat interface
- 🚀 **Easy Integration** - Single script tag or npm package
- 💬 **Session Management** - Automatic session handling with persistent threads
- 💾 **Flexible Storage** - localStorage, LangGraph-managed, or in-memory
- 🗂️ **Thread Management** - Create, switch, and delete conversation threads
- 🌓 **Theme Support** - Light and dark mode
- 📱 **Responsive** - Works perfectly on mobile and desktop
- 🔌 **Multi-Provider** - LangGraph, n8n, Make.com, or custom webhooks
- 🌊 **Streaming Support** - Real-time streaming responses from your backend
- 📐 **Multiple Layouts** - Full-page, side panel, or bottom tray form factors
- 👋 **Welcome Message** - Customizable greeting when starting a new conversation
- 💡 **Conversation Starters** - Pre-defined prompts to help users get started

## Quick Start

### Using LangGraph(/LangChain)

```html
<link
  href="https://cdn.jsdelivr.net/npm/genui-widget/dist/genui-widget.css"
  rel="stylesheet"
/>

<script type="module">
  import { createChat } from "https://cdn.jsdelivr.net/npm/genui-widget/dist/genui-widget.es.js";

  createChat({
    langgraph: {
      deploymentUrl: "https://your-deployment.langraph.app",
      assistantId: "your-assistant-id",
    },
    storageType: "langgraph", // Use LangGraph's built-in thread management
    agentName: "Assistant",
  });
</script>
```

### Using n8n or Custom Webhooks

```html
<link
  href="https://cdn.jsdelivr.net/npm/genui-widget/dist/genui-widget.css"
  rel="stylesheet"
/>

<script type="module">
  import { createChat } from "https://cdn.jsdelivr.net/npm/genui-widget/dist/genui-widget.es.js";

  createChat({
    n8n: {
      webhookUrl: "YOUR_WEBHOOK_URL",
      enableStreaming: true, // Optional: enable streaming responses
    },
    storageType: "localstorage", // Persist chats locally
    agentName: "Assistant",
  });
</script>
```

## Installation

### CDN (Recommended)

See Quick Start above.

### npm Package

```bash
npm install genui-widget
```

```javascript
import { createChat } from "genui-widget";

// With LangGraph
const chat = createChat({
  langgraph: {
    deploymentUrl: "https://your-deployment.langraph.app",
    assistantId: "your-assistant-id",
  },
  storageType: "langgraph",
});

// OR with n8n/webhooks
const chat = createChat({
  n8n: {
    webhookUrl: "YOUR_WEBHOOK_URL",
    enableStreaming: true,
  },
  storageType: "localstorage",
});
```

## Configuration

```javascript
const chat = createChat({
  // Provider configuration (choose one)
  langgraph: {
    deploymentUrl: "https://your-deployment.langraph.app",
    assistantId: "your-assistant-id",
  },
  // OR
  n8n: {
    webhookUrl: "https://your-webhook-endpoint.com/chat",
    enableStreaming: true, // Optional: Enable streaming responses
  },

  // Optional settings
  agentName: "Assistant", // Bot/agent name
  logoUrl: "https://example.com/logo.png", // Logo image URL
  theme: { mode: "light" }, // 'light' or 'dark'
  storageType: "langgraph", // 'none', 'localstorage', or 'langgraph'
  formFactor: "full-page", // 'full-page', 'side-panel', or 'bottom-tray'
  enableDebugLogging: false, // Enable console debug logging

  // Optional: Welcome message shown when thread is empty
  welcomeMessage: {
    title: "Hi, I'm Assistant",
    description: "I can help you with your questions.",
    image: { url: "https://example.com/logo.png" },
  },

  // Optional: Conversation starters
  conversationStarters: {
    variant: "short", // 'short' for pill buttons, 'long' for list items
    options: [
      { displayText: "Help me get started", prompt: "Help me get started" },
      { displayText: "What can you do?", prompt: "What can you do?" },
    ],
  },

  // Optional: Callbacks
  onSessionStart: (sessionId) => {
    console.log("Session started:", sessionId);
  },
  onError: (error) => {
    console.error("Chat error:", error);
  },
});
```

### Storage Options

**`storageType: "none"` (default):**

- Messages work normally during the session
- All data is lost on page refresh
- Best for: Simple use cases, demos, or privacy-focused applications

**`storageType: "localstorage"`:**

- Chat conversations persist across page refreshes
- Users can create and manage multiple threads
- Thread history is saved to browser localStorage
- Best for: n8n/webhook integrations without built-in persistence

**`storageType: "langgraph"`:**

- Leverages LangGraph's built-in thread management
- Conversations persist server-side across devices
- Requires `langgraph` provider configuration
- Thread operations (create, delete, update) sync with LangGraph API
- Best for: LangGraph deployments requiring cross-device sync

### Programmatic Control

```javascript
// Get current session ID
const sessionId = chat.getSessionId();

// Open the chat window
chat.open();

// Close the chat window
chat.close();

// Destroy the widget completely
chat.destroy();
```

## Provider Integration

### LangGraph

The widget integrates seamlessly with [LangGraph](https://langchain-ai.github.io/langgraph/) deployments (Cloud or self-hosted).

**Configuration:**

```javascript
createChat({
  langgraph: {
    deploymentUrl: "https://your-deployment.langraph.app",
    assistantId: "your-assistant-id",
  },
  storageType: "langgraph", // Recommended for LangGraph
});
```

**Features:**

- ✅ **Automatic Thread Management** - Creates and manages threads via LangGraph API
- ✅ **Server-Side Persistence** - Conversations persist across devices
- ✅ **Streaming Support** - Real-time streaming via Server-Sent Events (SSE)
- ✅ **Message History** - Fetches and displays conversation history
- ✅ **Thread Operations** - Create, update, delete threads with metadata

**How it works:**

1. Widget calls `POST /threads` to create new conversation threads
2. Messages sent via `POST /threads/{thread_id}/runs/stream` with streaming enabled
3. Thread history retrieved via `GET /threads/{thread_id}/history`
4. Thread list fetched via `POST /threads/search`

The LangGraph provider automatically handles the streaming response format and extracts message content from the SSE events.

## Webhook Integration

### Request Format

The chat client sends POST requests to your webhook:

```json
{
  "chatInput": "User's message here",
  "sessionId": "uuid-v4-session-id"
}
```

### Response Format

**Non-streaming mode:**

```json
{
  "output": "Your bot's response here"
}
```

**Streaming mode (`enableStreaming: true`):**

Return line-delimited JSON chunks:

```
{ "type": "item", "content": "First chunk " }
{ "type": "item", "content": "second chunk " }
{ "type": "item", "content": "final chunk" }
```

## Provider Setup

### n8n

Follow the instructions at [thesys.dev/n8n](https://thesys.dev/n8n) to quickly set up your n8n workflow.

## Configuration Reference

Complete list of all available options:

### Provider Configuration

**You must configure either `langgraph` OR `n8n` (not both):**

#### langgraph (optional)

```typescript
langgraph?: {
  // Required: Your LangGraph deployment URL
  deploymentUrl: string;

  // Required: The assistant ID to use
  assistantId: string;
}
```

Use this for LangGraph Cloud or self-hosted deployments. When using LangGraph, set `storageType: "langgraph"` to leverage server-side thread management.

#### n8n (optional)

```typescript
n8n?: {
  // Required: Your webhook URL
  webhookUrl: string;

  // Optional: Enable streaming responses (default: false)
  enableStreaming?: boolean;

  // Optional: Custom webhook configuration
  webhookConfig?: {
    method?: string;                    // HTTP method (default: "POST")
    headers?: Record<string, string>;   // Custom headers
  };
}
```

Use this for n8n, Make.com, or any custom webhook endpoint.

### agentName (optional)

```typescript
agentName?: string;  // Default: "Assistant"
```

The name displayed for the bot/agent in the chat interface.

### logoUrl (optional)

```typescript
logoUrl?: string;
```

URL to a logo image that will be displayed in the chat interface.

### enableDebugLogging (optional)

```typescript
enableDebugLogging?: boolean;  // Default: false
```

Enable debug logging to the browser console. Useful for troubleshooting webhook integration issues.

### theme (optional)

```typescript
theme?: {
  mode: 'light' | 'dark';  // Default: 'light'
}
```

Sets the color scheme for the chat interface.

### storageType (optional)

```typescript
storageType?: 'none' | 'localstorage' | 'langgraph';  // Default: 'none'
```

Controls chat history persistence:

- `'none'` - Messages are kept in memory only, lost on page refresh
- `'localstorage'` - Messages are saved to browser localStorage, persist across sessions
- `'langgraph'` - Uses LangGraph's server-side thread management (requires `langgraph` provider)

### welcomeMessage (optional)

```typescript
welcomeMessage?: {
  title?: string;       // Main heading text
  description?: string; // Subheading/description text
  image?: { url: string }; // Optional logo/image
} | React.ComponentType; // Or provide a custom component
```

Displayed when the thread is empty to greet users.

**Example:**

```javascript
createChat({
  n8n: { webhookUrl: "YOUR_WEBHOOK_URL" },
  welcomeMessage: {
    title: "Hi, I'm Assistant",
    description: "I can help you with your questions.",
    image: { url: "/logo.png" },
  },
});
```

### conversationStarters (optional)

```typescript
conversationStarters?: {
  variant?: 'short' | 'long'; // 'short' = pill buttons, 'long' = list items
  options: Array<{
    displayText: string; // Text shown on the button
    prompt: string;      // Message sent when clicked
    icon?: React.ReactNode; // Optional icon
  }>;
}
```

Clickable prompts shown when the thread is empty to help users begin a conversation.

**Example:**

```javascript
createChat({
  n8n: { webhookUrl: "YOUR_WEBHOOK_URL" },
  conversationStarters: {
    variant: "short",
    options: [
      { displayText: "Help me get started", prompt: "Help me get started" },
      { displayText: "What can you do?", prompt: "What can you do?" },
      { displayText: "Show me examples", prompt: "Show me some examples" },
    ],
  },
});
```

### formFactor (optional)

```typescript
formFactor?: 'full-page' | 'side-panel' | 'bottom-tray';  // Default: 'full-page'
```

Controls the layout form factor:

- `'full-page'` - Takes up the entire viewport
- `'side-panel'` - Displays as a side panel on the right
- `'bottom-tray'` - Appears as a collapsible tray at the bottom of the screen

> **Note:** The `mode` property is deprecated. Use `formFactor` instead (`'fullscreen'` → `'full-page'`, `'sidepanel'` → `'side-panel'`).

### bottomTray (optional)

```typescript
bottomTray?: {
  // Control the open state of the bottom tray (controlled mode)
  isOpen?: boolean;

  // Callback when bottom tray open state changes
  onOpenChange?: (isOpen: boolean) => void;

  // Default open state for bottom tray (uncontrolled mode)
  defaultOpen?: boolean;
}
```

Configuration options specific to the `bottom-tray` form factor. Only used when `formFactor` is set to `'bottom-tray'`.

**Example usage:**

```javascript
createChat({
  n8n: { webhookUrl: "YOUR_WEBHOOK_URL" },
  formFactor: "bottom-tray",
  bottomTray: {
    defaultOpen: false, // Start collapsed
    onOpenChange: (isOpen) => {
      console.log("Tray is now:", isOpen ? "open" : "closed");
    },
  },
});
```

**Controlled vs Uncontrolled mode:**

- **Uncontrolled:** Use `defaultOpen` to set initial state, let the widget manage it
- **Controlled:** Use `isOpen` and `onOpenChange` to fully control the tray state externally

### onSessionStart (optional)

```typescript
onSessionStart?: (sessionId: string) => void;
```

Callback function that fires when a new chat session is created. Receives the session ID as a parameter. Useful for analytics or tracking.

### onError (optional)

```typescript
onError?: (error: Error) => void;
```

Callback function that fires when an error occurs during message processing. Useful for logging, analytics, or custom error handling. Note that the widget will still display error states in the chat UI automatically.

## Troubleshooting

### Chat doesn't load

- Check browser console for errors (enable `enableDebugLogging: true`)
- Verify provider configuration is correct (LangGraph URL/assistant ID or webhook URL)
- Ensure endpoint is active and accessible
- Check CORS settings

### Connection errors

**For LangGraph:**

- Verify `deploymentUrl` and `assistantId` are correct
- Check that the LangGraph deployment is running
- Ensure your assistant is deployed and accessible

**For n8n/webhooks:**

- Verify webhook URL is correct
- Check CORS configuration
- Ensure your domain is allowlisted (for n8n)
- Test webhook endpoint independently

### Messages not sending or displaying

**For LangGraph:**

- Check that streaming is working (SSE connection)
- Verify assistant is responding correctly
- Check thread creation/access permissions

**For n8n/webhooks:**

- Verify response format: `{ "output": "message" }`
- For streaming, ensure line-delimited JSON format
- Check webhook execution logs
- Enable `enableStreaming` if using streaming responses

### Storage issues

- If using `storageType: "langgraph"`, ensure LangGraph provider is configured
- For localStorage, check browser storage isn't full
- Clear localStorage if you encounter corrupted state: `localStorage.clear()`

## Requirements

- **Node.js**: Version 20.9.0 or higher (for development)

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT

## Support

- GitHub Issues: [Create an issue](https://github.com/thesysdev/genui-widget/issues)
- Documentation: [View docs](https://github.com/thesysdev/genui-widget)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
