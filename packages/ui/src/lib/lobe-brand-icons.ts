import ai21 from "@lobehub/icons-static-svg/icons/ai21.svg";
import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg";
import antgroup from "@lobehub/icons-static-svg/icons/antgroup.svg";
import aws from "@lobehub/icons-static-svg/icons/aws.svg";
import azure from "@lobehub/icons-static-svg/icons/azure.svg";
import baseten from "@lobehub/icons-static-svg/icons/baseten.svg";
import bedrock from "@lobehub/icons-static-svg/icons/bedrock.svg";
import cerebras from "@lobehub/icons-static-svg/icons/cerebras.svg";
import chatglm from "@lobehub/icons-static-svg/icons/chatglm.svg";
import claude from "@lobehub/icons-static-svg/icons/claude.svg";
import cloudflare from "@lobehub/icons-static-svg/icons/cloudflare.svg";
import codex from "@lobehub/icons-static-svg/icons/codex.svg";
import cohere from "@lobehub/icons-static-svg/icons/cohere.svg";
import cursor from "@lobehub/icons-static-svg/icons/cursor.svg";
import deepinfra from "@lobehub/icons-static-svg/icons/deepinfra.svg";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek.svg";
import doubao from "@lobehub/icons-static-svg/icons/doubao.svg";
import fireworks from "@lobehub/icons-static-svg/icons/fireworks.svg";
import gemini from "@lobehub/icons-static-svg/icons/gemini.svg";
import gemma from "@lobehub/icons-static-svg/icons/gemma.svg";
import github from "@lobehub/icons-static-svg/icons/github.svg";
import githubcopilot from "@lobehub/icons-static-svg/icons/githubcopilot.svg";
import google from "@lobehub/icons-static-svg/icons/google.svg";
import grok from "@lobehub/icons-static-svg/icons/grok.svg";
import groq from "@lobehub/icons-static-svg/icons/groq.svg";
import huggingface from "@lobehub/icons-static-svg/icons/huggingface.svg";
import hunyuan from "@lobehub/icons-static-svg/icons/hunyuan.svg";
import hyperbolic from "@lobehub/icons-static-svg/icons/hyperbolic.svg";
import internlm from "@lobehub/icons-static-svg/icons/internlm.svg";
import jina from "@lobehub/icons-static-svg/icons/jina.svg";
import kimi from "@lobehub/icons-static-svg/icons/kimi.svg";
import lambda from "@lobehub/icons-static-svg/icons/lambda.svg";
import longcat from "@lobehub/icons-static-svg/icons/longcat.svg";
import meta from "@lobehub/icons-static-svg/icons/meta.svg";
import minimax from "@lobehub/icons-static-svg/icons/minimax.svg";
import mistral from "@lobehub/icons-static-svg/icons/mistral.svg";
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg";
import nebius from "@lobehub/icons-static-svg/icons/nebius.svg";
import novita from "@lobehub/icons-static-svg/icons/novita.svg";
import nvidia from "@lobehub/icons-static-svg/icons/nvidia.svg";
import ollama from "@lobehub/icons-static-svg/icons/ollama.svg";
import openai from "@lobehub/icons-static-svg/icons/openai.svg";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg";
import perplexity from "@lobehub/icons-static-svg/icons/perplexity.svg";
import pi from "@lobehub/icons-static-svg/icons/pi.svg";
import qwen from "@lobehub/icons-static-svg/icons/qwen.svg";
import replicate from "@lobehub/icons-static-svg/icons/replicate.svg";
import sambanova from "@lobehub/icons-static-svg/icons/sambanova.svg";
import siliconcloud from "@lobehub/icons-static-svg/icons/siliconcloud.svg";
import stepfun from "@lobehub/icons-static-svg/icons/stepfun.svg";
import together from "@lobehub/icons-static-svg/icons/together.svg";
import vercel from "@lobehub/icons-static-svg/icons/vercel.svg";
import vertexai from "@lobehub/icons-static-svg/icons/vertexai.svg";
import voyage from "@lobehub/icons-static-svg/icons/voyage.svg";
import workersai from "@lobehub/icons-static-svg/icons/workersai.svg";
import xai from "@lobehub/icons-static-svg/icons/xai.svg";
import xiaomimimo from "@lobehub/icons-static-svg/icons/xiaomimimo.svg";
import yi from "@lobehub/icons-static-svg/icons/yi.svg";
import zai from "@lobehub/icons-static-svg/icons/zai.svg";
import zhipu from "@lobehub/icons-static-svg/icons/zhipu.svg";

export const LOBE_ICONS = {
  ai21,
  anthropic,
  antgroup,
  aws,
  azure,
  baseten,
  bedrock,
  cerebras,
  chatglm,
  claude,
  cloudflare,
  codex,
  cohere,
  cursor,
  deepinfra,
  deepseek,
  doubao,
  fireworks,
  gemini,
  gemma,
  github,
  githubcopilot,
  google,
  grok,
  groq,
  huggingface,
  hunyuan,
  hyperbolic,
  internlm,
  jina,
  kimi,
  lambda,
  longcat,
  meta,
  minimax,
  mistral,
  moonshot,
  nebius,
  novita,
  nvidia,
  ollama,
  openai,
  opencode,
  openrouter,
  perplexity,
  pi,
  qwen,
  replicate,
  sambanova,
  siliconcloud,
  stepfun,
  together,
  vercel,
  vertexai,
  voyage,
  workersai,
  xai,
  xiaomimimo,
  yi,
  zai,
  zhipu,
} as const;

export type LobeIconId = keyof typeof LOBE_ICONS;

const PROVIDER_ALIASES: Record<string, LobeIconId> = {
  "amazon-bedrock": "bedrock",
  "ant-ling": "antgroup",
  "aws-bedrock": "bedrock",
  "azure-openai": "azure",
  "claude-acp": "claude",
  "cloudflare-ai-gateway": "cloudflare",
  "cloudflare-auth": "cloudflare",
  "cloudflare-stream": "cloudflare",
  "cloudflare-workers-ai": "workersai",
  copilot: "githubcopilot",
  "github-copilot": "githubcopilot",
  glm: "chatglm",
  "google-gemini": "gemini",
  "google-vertex": "vertexai",
  hf: "huggingface",
  "hugging-face": "huggingface",
  moonshotai: "moonshot",
  "openai-codex": "codex",
  siliconflow: "siliconcloud",
  vertex: "vertexai",
  "x-ai": "xai",
  xiaomi: "xiaomimimo",
  zhipuai: "zhipu",
};

/** More specific model-id tokens first. OpenRouter always keeps its own mark. */
const MODEL_BRAND_PATTERNS: ReadonlyArray<readonly [LobeIconId, RegExp]> = [
  ["claude", /claude/],
  ["codex", /codex/],
  ["gemini", /gemini/],
  ["gemma", /(^|[/-])gemma/],
  ["grok", /(^|[/-])grok/],
  ["deepseek", /deepseek/],
  ["qwen", /qwen|qwq|qvq/],
  ["mistral", /mistral|mixtral|codestral|pixtral|ministral|magistral/],
  ["meta", /llama/],
  ["ai21", /jamba|(^|[/-])ai21/],
  ["doubao", /doubao/],
  ["hunyuan", /hunyuan/],
  ["internlm", /internlm/],
  ["stepfun", /stepfun|(^|[/-])step-?\d/],
  ["zai", /chatglm|(^|[/-])glm-|(^|[/-])zai($|[/-])|(^|[/-])zhipu/],
  ["yi", /(^|[/-])yi-|(^|[/-])yi($|[/-])/],
  ["longcat", /longcat/],
  ["xiaomimimo", /xiaomi|(^|[/-])mimo/],
  ["kimi", /kimi/],
  ["moonshot", /moonshot/],
  ["opencode", /opencode/],
  ["minimax", /minimax/],
  ["perplexity", /pplx|(^|[/-])sonar/],
  ["nvidia", /nemotron/],
  ["cohere", /(^|[/-])command/],
  ["voyage", /voyage/],
  ["jina", /jina/],
  ["cerebras", /cerebras/],
  ["groq", /groq/],
  ["fireworks", /fireworks/],
  ["together", /together/],
  ["baseten", /baseten/],
  ["workersai", /workers-ai|workersai/],
  ["cloudflare", /cloudflare/],
  ["vercel", /vercel/],
  ["siliconcloud", /siliconflow|siliconcloud/],
  ["novita", /novita/],
  ["sambanova", /sambanova/],
  ["hyperbolic", /hyperbolic/],
  ["nebius", /nebius/],
  ["huggingface", /huggingface/],
  ["cursor", /cursor/],
  ["openai", /(^|[/-])(gpt-|o1|o3|o4)|openai/],
  ["anthropic", /anthropic/],
  ["google", /google/],
  ["pi", /(^|[/-])pi($|[/-])/],
];

export function canonicalizeBrandKey(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

function isLobeIconId(value: string): value is LobeIconId {
  return value in LOBE_ICONS;
}

export function resolveProviderIconId(provider: string): LobeIconId | undefined {
  const key = canonicalizeBrandKey(provider);
  if (isLobeIconId(key)) {
    return key;
  }
  const aliased = PROVIDER_ALIASES[key];
  if (aliased) {
    return aliased;
  }
  const parts = key.split("-");
  for (let count = parts.length - 1; count >= 1; count -= 1) {
    const candidate = parts.slice(0, count).join("-");
    if (isLobeIconId(candidate)) {
      return candidate;
    }
    const prefixAlias = PROVIDER_ALIASES[candidate];
    if (prefixAlias) {
      return prefixAlias;
    }
  }
  return undefined;
}

export function resolveModelIconId(modelId: string, provider: string): LobeIconId | undefined {
  const providerId = resolveProviderIconId(provider);
  if (providerId === "openrouter") {
    return "openrouter";
  }
  const haystack = `${canonicalizeBrandKey(provider)}/${canonicalizeBrandKey(modelId)}`;
  for (const [icon, pattern] of MODEL_BRAND_PATTERNS) {
    if (pattern.test(haystack)) {
      return icon;
    }
  }
  return providerId;
}
