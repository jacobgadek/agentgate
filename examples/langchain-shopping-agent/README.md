# LangChain Shopping Agent Example

A full example showing how to integrate AgentGate with LangChain. The agent can search products, check its trust score, and make purchases — all through LangChain tools.

## Run it

```bash
pnpm install
pnpm start
```

## What it does

1. Initializes AgentGate in sandbox mode
2. Defines three LangChain `DynamicTool` wrappers:
   - `search_products` — searches a mock product catalog
   - `check_trust_score` — reads the agent's trust level
   - `purchase_product` — executes a purchase through AgentGate
3. Simulates an agent decision loop (search → trust check → buy → buy → final trust check)

## Using with a real LLM

To connect to a real LLM agent, replace the simulated workflow with:

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';

const llm = new ChatOpenAI({ model: 'gpt-4o' });
const agent = createOpenAIFunctionsAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent, tools });
const result = await executor.invoke({ input: 'Buy me some wireless earbuds' });
```

## Policies in action

The agent is configured with:
- **Max transaction**: $200
- **Daily spend limit**: $1,000
- **Allowed categories**: electronics, food, books

Try modifying the policies or catalog to see how AgentGate enforces constraints.
