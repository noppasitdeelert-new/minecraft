import Exa from "exa-js";

/**
 * Web search ผ่าน Exa (https://exa.ai/docs)
 * อ่านคีย์จาก environment variable EXA_API_KEY — ไม่ฝังคีย์ในโค้ด
 */
export function hasExaKey(): boolean {
  return Boolean(process.env.EXA_API_KEY?.trim());
}

let client: Exa | null = null;

function exaClient(): Exa {
  if (!hasExaKey()) throw new Error("ยังไม่ได้ตั้งค่า EXA_API_KEY");
  client ??= new Exa(process.env.EXA_API_KEY);
  return client;
}

export type WebSearchResult = {
  title: string;
  url: string;
  published_date: string | null;
  highlights: string[];
};

/** ค้นหาเว็บและดึง highlights (ข้อความที่เกี่ยวข้องกับคำค้น) จากแต่ละผลลัพธ์ */
export async function searchWeb(query: string, numResults = 5): Promise<WebSearchResult[]> {
  const exa = exaClient();
  const result = await exa.search(query, {
    type: "auto",
    numResults: Math.min(Math.max(Math.trunc(numResults) || 5, 1), 10),
    contents: { highlights: true },
  });

  return result.results.map((item) => ({
    title: item.title?.trim() || item.url,
    url: item.url,
    published_date: item.publishedDate ?? null,
    highlights: item.highlights ?? [],
  }));
}
