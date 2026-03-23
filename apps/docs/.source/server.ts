// @ts-nocheck
import * as __fd_glob_15 from "../content/guides/sandbox.mdx?collection=docs"
import * as __fd_glob_14 from "../content/guides/langchain.mdx?collection=docs"
import * as __fd_glob_13 from "../content/guides/crewai.mdx?collection=docs"
import * as __fd_glob_12 from "../content/api-reference/trust.mdx?collection=docs"
import * as __fd_glob_11 from "../content/api-reference/transact.mdx?collection=docs"
import * as __fd_glob_10 from "../content/api-reference/identity.mdx?collection=docs"
import * as __fd_glob_9 from "../content/concepts/trust.mdx?collection=docs"
import * as __fd_glob_8 from "../content/concepts/routing.mdx?collection=docs"
import * as __fd_glob_7 from "../content/concepts/policies.mdx?collection=docs"
import * as __fd_glob_6 from "../content/concepts/identity.mdx?collection=docs"
import * as __fd_glob_5 from "../content/quickstart.mdx?collection=docs"
import * as __fd_glob_4 from "../content/index.mdx?collection=docs"
import { default as __fd_glob_3 } from "../content/concepts/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/guides/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/api-reference/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content", {"meta.json": __fd_glob_0, "api-reference/meta.json": __fd_glob_1, "guides/meta.json": __fd_glob_2, "concepts/meta.json": __fd_glob_3, }, {"index.mdx": __fd_glob_4, "quickstart.mdx": __fd_glob_5, "concepts/identity.mdx": __fd_glob_6, "concepts/policies.mdx": __fd_glob_7, "concepts/routing.mdx": __fd_glob_8, "concepts/trust.mdx": __fd_glob_9, "api-reference/identity.mdx": __fd_glob_10, "api-reference/transact.mdx": __fd_glob_11, "api-reference/trust.mdx": __fd_glob_12, "guides/crewai.mdx": __fd_glob_13, "guides/langchain.mdx": __fd_glob_14, "guides/sandbox.mdx": __fd_glob_15, });