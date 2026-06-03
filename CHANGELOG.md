# Changelog

## [0.1.1](https://github.com/amitray007/goalert-mcp/compare/v0.1.0...v0.1.1) (2026-06-03)


### Documentation

* lead README with the goalert-mcp name for search/snippet ([78b0730](https://github.com/amitray007/goalert-mcp/commit/78b073001e518568722b35a1de01f592364d93f9))

## 0.1.0 (2026-06-03)


### Features

* config loading and validation ([7e6faf8](https://github.com/amitray007/goalert-mcp/commit/7e6faf8e4fc8c31e87c9df2e9bef0ca0f5f5fc9f))
* create_alert and manage_alerts tools ([906e285](https://github.com/amitray007/goalert-mcp/commit/906e2858a3cb646bd19043f880b6d7c3e9a4a77d))
* create_service and update_service tools ([cdde2c7](https://github.com/amitray007/goalert-mcp/commit/cdde2c7ae50510a67dc290d8954500ea960179b8))
* cursor pagination helper ([a2af4c2](https://github.com/amitray007/goalert-mcp/commit/a2af4c2d83573ac48c783e63a434a585227fa124))
* error types and secret redaction ([1264eec](https://github.com/amitray007/goalert-mcp/commit/1264eec12280e4767fa2fc7af6f9de1c0a646dba))
* generic goalert_delete, set_favorite, and set_label tools ([c7f938c](https://github.com/amitray007/goalert-mcp/commit/c7f938cc3fe198ebee6d62abc48cf8cd9f8ef58b))
* get_on_call tool ([427794d](https://github.com/amitray007/goalert-mcp/commit/427794df8d23586e86fb7d6cf88a0223421c0add))
* GoAlert authenticator (password + token modes) ([eb61aed](https://github.com/amitray007/goalert-mcp/commit/eb61aede4a5d59c46485c72bfce1f1bef9546ad0))
* list_alerts and get_alert tools ([2bafe8d](https://github.com/amitray007/goalert-mcp/commit/2bafe8d44fcab153cd545ec37eda475881edf6cd))
* list_services and get_service tools ([07aca3f](https://github.com/amitray007/goalert-mcp/commit/07aca3fa7b303bbb37f9fc98deae06d4f9284e15))
* list/get escalation policy tools ([5aae69e](https://github.com/amitray007/goalert-mcp/commit/5aae69e9abe36df7c848c5021450769474117825))
* list/get user tools (read-only) ([300d4f6](https://github.com/amitray007/goalert-mcp/commit/300d4f66823b537628b9b50136d3b6ff726044a3))
* list/get/create/update rotation tools (incl. activeUserIndex override) ([b5d2a1a](https://github.com/amitray007/goalert-mcp/commit/b5d2a1a030740f2aa7272481fc458c4efe691862))
* manage_heartbeat_monitors tool ([fda51dc](https://github.com/amitray007/goalert-mcp/commit/fda51dc4bf4b5cfeab9286fdda02568fca9acbab))
* manage_integration_keys tool ([7650bb6](https://github.com/amitray007/goalert-mcp/commit/7650bb6ffd7446fbacccf4b9f304c1f9b3c48d57))
* MCP server bootstrap (stdio) ([fa30f48](https://github.com/amitray007/goalert-mcp/commit/fa30f489eafe21f946fc9e948efe3b25adf70787))
* read-only raw GraphQL query tool ([0e3ff99](https://github.com/amitray007/goalert-mcp/commit/0e3ff997e17bd6efffda79a49e306a489657c458))
* schedule tools — list/get schedules, create/update, set_schedule_target, manage_overrides, manage_temporary_schedule (Tasks 21–24) ([dc06bcc](https://github.com/amitray007/goalert-mcp/commit/dc06bcc24f9e30f0c5804a62f0a22a571720ecad))
* serialized GraphQL executor with re-auth retry ([b9e31ce](https://github.com/amitray007/goalert-mcp/commit/b9e31ce0dbf32f9dcb9bee323af188cebae5f7cf))
* tool output formatting helpers ([a3888b5](https://github.com/amitray007/goalert-mcp/commit/a3888b5fe812cb4576b579a28fd11eaeceef9b19))
* tool registry with read-only guard and error wrapping ([e0f4fbd](https://github.com/amitray007/goalert-mcp/commit/e0f4fbddc1856b54ac128156bbf683b5b0eb7525))


### Bug Fixes

* advance pagination cursor inside input.after, not top-level ([32227c1](https://github.com/amitray007/goalert-mcp/commit/32227c1a15b413e3392fd5437d2532261b83ee09))
* commit pending strict-tsconfig mock typing for common.test.ts ([d88796f](https://github.com/amitray007/goalert-mcp/commit/d88796fb5ad6b9555cd5e11041560e9e00481f1c))
* correct get_alert fields, wrap array structuredContent, label key docs ([6adc7db](https://github.com/amitray007/goalert-mcp/commit/6adc7db2e8f821adf915220e79924cd7efc44d62))
* harden GraphQL error handling, base-URL path, pagination typing ([a2f87da](https://github.com/amitray007/goalert-mcp/commit/a2f87daa695e7aec10fb344bca9711c108b3ecc9))
* parse-based read-only guard for goalert_graphql_query + harden tool registry ([89f95dc](https://github.com/amitray007/goalert-mcp/commit/89f95dc5839bba7c114bf8b327c5cf287fb1df07))
* run server when launched via npm bin symlink ([d9aebe1](https://github.com/amitray007/goalert-mcp/commit/d9aebe13d4335dd82acf852ed06c4836fa5abee3))
* scope goalert_delete to valid operator TargetTypes; clarify manage_alerts ([ace2f26](https://github.com/amitray007/goalert-mcp/commit/ace2f26239c2d5f77413d0422c6f2369ca54a1ee))


### Documentation

* add GoAlert MCP implementation plan ([6cf08f8](https://github.com/amitray007/goalert-mcp/commit/6cf08f8644bdc0cb88acba1d38e0d8e613ecfac5))
* add GoAlert MCP server design spec ([489395a](https://github.com/amitray007/goalert-mcp/commit/489395a3a5420c9d5e58c7d7798580599162e85f))
* correct tool counts in README (33 tools, 14 read-only) ([39f217e](https://github.com/amitray007/goalert-mcp/commit/39f217ee76a9d5e0194be6dfab092964a5dd3ac4))
* **plan:** correct delete TargetType set and EP-step removal mechanism ([7122c40](https://github.com/amitray007/goalert-mcp/commit/7122c40f986a88f44847daa99ddb9771a6f33e3a))
* **plan:** fix Phase 3 EP queries against verified schema ([e29ab5c](https://github.com/amitray007/goalert-mcp/commit/e29ab5ce41db78b38bfbc169f1fd7aa1d5053835))
* **plan:** sync ok() array-wrap, GET_ALERT fields, set_label key format ([b7269b4](https://github.com/amitray007/goalert-mcp/commit/b7269b465205b760b6537e432d36bbb1bc978d50))
* README OSS polish — badges, contributing/license sections, fixes ([c83f4b7](https://github.com/amitray007/goalert-mcp/commit/c83f4b72ff444a1e0f5ff17542dec438aa56be8d))
* README with setup, config, and tool catalog ([027e5e7](https://github.com/amitray007/goalert-mcp/commit/027e5e706973aa73016c132dd47a7997bf5e5478))


### Continuous Integration

* automate releases with release-please (tag + GitHub release + npm publish) ([2865704](https://github.com/amitray007/goalert-mcp/commit/286570479cc86a62008ff97173733ddf9663cb8a))

## Changelog

This file is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commit](https://www.conventionalcommits.org/) messages — a new
section is generated for each release.
