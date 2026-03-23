# CrewAI Booking Agent Example

A multi-agent crew that collaborates to find, evaluate, and book travel accommodations using AgentGate for payments.

## Run it

```bash
pnpm install
pnpm start
```

## Architecture

Three agents with distinct roles:

| Agent | Role | Can Spend? |
|-------|------|------------|
| **Researcher** | Searches listings within budget | No |
| **Analyst** | Scores options against preferences | No |
| **Booker** | Executes the booking transaction | Yes ($1,000 max) |

## What it does

1. Registers three agents with different capabilities and policies
2. **Researcher** filters hotels by budget
3. **Analyst** ranks options by rating, amenity match, and total cost
4. **Booker** executes the purchase through AgentGate
5. Checks trust score after the transaction

## Key concepts

- **Least-privilege policies**: Only the Booker agent can spend money
- **Category restrictions**: Booker is limited to travel/accommodation/transport
- **Trust tracking**: Each successful transaction improves the agent's trust score
- **Separation of concerns**: Research and analysis agents have zero spend authority
