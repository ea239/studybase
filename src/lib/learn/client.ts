import { LEARN_ORIGIN, readLearnSession, type LearnSession } from "./session";

// Thrown when LEARN answers as if nobody is logged in. Callers surface this as
// "session expired, run the login script again" rather than a generic failure.
export class LearnAuthError extends Error {
  constructor(message = "LEARN 会话已失效，请重新登录") {
    super(message);
    this.name = "LearnAuthError";
  }
}

// D2L bumps its API versions constantly, so the supported set is discovered at
// runtime (this endpoint needs no auth) instead of being pinned in code.
let versionCache: { at: number; le: string; lp: string } | null = null;
const VERSION_TTL = 12 * 60 * 60 * 1000;

async function apiVersions() {
  if (versionCache && Date.now() - versionCache.at < VERSION_TTL) return versionCache;
  const res = await fetch(`${LEARN_ORIGIN}/d2l/api/versions/`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`无法获取 LEARN API 版本 (${res.status})`);
  const products: { ProductCode: string; LatestVersion: string }[] = await res.json();
  const pick = (code: string, fallback: string) =>
    products.find((p) => p.ProductCode === code)?.LatestVersion ?? fallback;
  versionCache = { at: Date.now(), le: pick("le", "1.97"), lp: pick("lp", "1.63") };
  return versionCache;
}

async function request(session: LearnSession, url: string, accept = "application/json") {
  const res = await fetch(url, {
    headers: {
      Accept: accept,
      Cookie: session.cookieHeader,
      // Brightspace serves a login redirect to clients it doesn't recognise.
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    redirect: "manual",
  });
  // An expired session doesn't 401 — it 302s to the SSO login page. Treat both
  // as auth failures so the caller can tell the owner to log in again.
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new LearnAuthError();
  }
  if (!res.ok) throw new Error(`LEARN 请求失败 ${res.status}: ${url}`);
  return res;
}

export type LearnCourseInfo = { orgUnitId: string; name: string; code: string | null };

/** Course offerings the logged-in user is enrolled in. */
export async function listCourses(): Promise<LearnCourseInfo[]> {
  const session = await requireSession();
  const { lp } = await apiVersions();
  const out: LearnCourseInfo[] = [];

  // orgUnitTypeId=3 is "Course Offering" — without it the list also returns
  // departments, semesters and the org root, which aren't courses.
  let url: string | null =
    `${LEARN_ORIGIN}/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3`;
  while (url) {
    const page: {
      Items?: { OrgUnit?: { Id?: number; Name?: string; Code?: string | null } }[];
      PagingInfo?: { Bookmark?: string | null; HasMoreItems?: boolean };
    } = await (await request(session, url)).json();

    for (const item of page.Items ?? []) {
      const id = item.OrgUnit?.Id;
      if (id == null) continue;
      out.push({
        orgUnitId: String(id),
        name: item.OrgUnit?.Name ?? `课程 ${id}`,
        code: item.OrgUnit?.Code ?? null,
      });
    }

    url =
      page.PagingInfo?.HasMoreItems && page.PagingInfo.Bookmark
        ? `${LEARN_ORIGIN}/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3&bookmark=${encodeURIComponent(page.PagingInfo.Bookmark)}`
        : null;
  }
  return out;
}

export type LearnTopic = {
  topicId: string;
  title: string;
  /** Path LEARN reports for the stored file; used to recover the real extension. */
  url: string | null;
  updatedAt: Date | null;
  /** Breadcrumb of module titles, e.g. ["Lectures", "Week 3"]. */
  modulePath: string[];
};

type ContentNode = {
  Id?: number;
  Title?: string;
  Type?: number; // 0 = module, 1 = topic
  TopicType?: number; // 1 = file, 3 = link
  Url?: string | null;
  LastModifiedDate?: string | null;
  Structure?: ContentNode[];
};

/**
 * Flattens a course's content tree into downloadable file topics.
 * TopicType 1 is a stored file; links (3) point off-site and are skipped.
 */
export async function listTopics(orgUnitId: string): Promise<LearnTopic[]> {
  const session = await requireSession();
  const { le } = await apiVersions();
  const root: ContentNode[] = await (
    await request(session, `${LEARN_ORIGIN}/d2l/api/le/${le}/${orgUnitId}/content/root/`)
  ).json();

  const topics: LearnTopic[] = [];
  const walk = (nodes: ContentNode[], trail: string[]) => {
    for (const node of nodes) {
      if (node.Type === 0) {
        walk(node.Structure ?? [], node.Title ? [...trail, node.Title] : trail);
      } else if (node.Type === 1 && node.TopicType === 1 && node.Id != null) {
        topics.push({
          topicId: String(node.Id),
          title: node.Title ?? `topic-${node.Id}`,
          url: node.Url ?? null,
          updatedAt: node.LastModifiedDate ? new Date(node.LastModifiedDate) : null,
          modulePath: trail,
        });
      }
    }
  };
  walk(root, []);
  return topics;
}

/** Downloads a topic's file bytes. */
export async function downloadTopic(orgUnitId: string, topicId: string): Promise<Buffer> {
  const session = await requireSession();
  const { le } = await apiVersions();
  const res = await request(
    session,
    `${LEARN_ORIGIN}/d2l/api/le/${le}/${orgUnitId}/content/topics/${topicId}/file`,
    "*/*"
  );
  return Buffer.from(await res.arrayBuffer());
}

async function requireSession() {
  const session = await readLearnSession();
  if (!session) throw new LearnAuthError("还没有 LEARN 登录会话，请先在本机运行登录脚本");
  return session;
}
