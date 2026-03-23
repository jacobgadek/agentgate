// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/index.mdx?collection=docs"), "quickstart.mdx": () => import("../content/quickstart.mdx?collection=docs"), "api-reference/identity.mdx": () => import("../content/api-reference/identity.mdx?collection=docs"), "api-reference/transact.mdx": () => import("../content/api-reference/transact.mdx?collection=docs"), "api-reference/trust.mdx": () => import("../content/api-reference/trust.mdx?collection=docs"), "concepts/identity.mdx": () => import("../content/concepts/identity.mdx?collection=docs"), "concepts/policies.mdx": () => import("../content/concepts/policies.mdx?collection=docs"), "concepts/routing.mdx": () => import("../content/concepts/routing.mdx?collection=docs"), "concepts/trust.mdx": () => import("../content/concepts/trust.mdx?collection=docs"), "guides/crewai.mdx": () => import("../content/guides/crewai.mdx?collection=docs"), "guides/langchain.mdx": () => import("../content/guides/langchain.mdx?collection=docs"), "guides/sandbox.mdx": () => import("../content/guides/sandbox.mdx?collection=docs"), }),
};
export default browserCollections;