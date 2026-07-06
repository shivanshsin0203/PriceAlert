// Single source for every outbound/contact link (footer, support page, nav).

export const LINKS = {
  github: "https://github.com/shivanshsin0203/PriceAlert",
  issues: "https://github.com/shivanshsin0203/PriceAlert/issues",
  x: "https://x.com/ShivanshSi0203",
  xHandle: "@ShivanshSi0203",
  email: "singhshivansh12may@gmail.com",
  // THE bot (user decision: one bot for dev + prod; transport flips to webhook at deploy).
  bot: "https://t.me/Pricealert_devbot",
  botHandle: "@Pricealert_devbot",
} as const;
