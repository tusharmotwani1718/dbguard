# Overview

We are building a web app for a hackathon. The app is named as "DBGuard".

The app would demonstrate a security layer over agent actions powered by "ArmorIQ".

ArmorIQ helps to add a security layer over agent tool actions by locking the intent and matching each agent action in runtime with the plan locked for the intent.

Like, suppose an agent has tools and access available to "fetch_mails", "send_mails" on behalf of a user and user queries the agent "Fetch my last 5 mails and summarize them". So the agent should only use "fetch_mails" tool not others. The core idea is Just because a tool is accessible to an agent doesn't means it should be used.

Without any security layer for this, we are just relying on agent intelligence to not use any incorrect tool or not the right tool as per intent. But ArmorIQ helps us to add that layer on top our agent.

More about this can be researched and known from the ArmorIQ official website.

The app that we are building for our hackathon does the same but for the db queries.

Means we will build an agent and give it some tools for the database operations like "add_table", "read_table", "update_table", "delete_table" and more like this and then we will add armorIQ security layer to our agent to prevent un-intended access of the tools by the agent.

## Approach

We will give the tools to the agent by creating (or using) an MCP server and provide these tools as mcp tools.

We will be using mistral AI typescript SDK for building the agent.

## Tech Stack

The web app is a monorepo initalised with Next JS, Typescript, shadcn and bun as runtime.

Agentic SDK: Mistral TypeScript SDK

**ArmorIQ is must to be used as the security layer for the agentic tool calls.**

## Hackathon Rules and details:

## What Your Project Must Have

1. **An AI Agent** (any model or framework: LangChain, CrewAI, Google ADK, custom, etc.)
2. **At least one MCP server** so your agent can perform real actions
3. **ArmorIQ integration** that shows:
   - One action being **allowed**
   - One action being **blocked**

It must be a **real, working** integration, not a fake or hardcoded demo.

**ArmorIQ is mandatory for every project.** No ArmorIQ = not eligible.&#x20;

These are the hackathon rules:


1. All projects must integrate ArmorIQ. Projects without functional ArmorIQ integration are not eligible for judging or prizes.
2. You may use any AI model, agent framework, programming language, or additional service.
3. Every project must use at least one MCP server.
4. Sensitive operations must use sandbox or test environments.
**No real customer data or production payment systems.**
5. Security demos must use **actual ArmorIQ enforcement**, not simulated or hardcoded results.

