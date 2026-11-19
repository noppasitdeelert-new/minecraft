/** Small fetch helpers for client components. */

async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `เกิดข้อผิดพลาด (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const apiGet = <T,>(url: string) => request<T>(url, "GET");
export const apiPost = <T,>(url: string, body?: unknown) => request<T>(url, "POST", body ?? {});
export const apiPatch = <T,>(url: string, body?: unknown) => request<T>(url, "PATCH", body ?? {});
export const apiPut = <T,>(url: string, body?: unknown) => request<T>(url, "PUT", body ?? {});
export const apiDelete = <T,>(url: string) => request<T>(url, "DELETE");
