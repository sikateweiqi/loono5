import { errorResponse, fail, isUuid, ok, readJson } from "@/app/api/_lib/http";
import { reportUser } from "@/lib/db/chat";
import { REPORT_REASONS, type ReportReason } from "@/lib/db/types";
import { requireViewerProfile } from "@/lib/db/viewer";

/**
 * 举报。
 *
 *   POST /api/reports { profileId, reason, details? }
 *
 * 举报人是服务端解析出的身份，**不接受**客户端指定：举报是记名行为
 * （user_reports.reporter_id 是外键，前台也明确告诉用户举报不是匿名的），
 * 让调用者自带 reporter 就等于允许冒名举报。
 *
 * reason 用 REPORT_REASONS 校验：那个常量与 user_reports 上的 CHECK 约束一一对应，
 * 在这里拒绝非法值，界面拿到的是 400 而不是数据库约束报错。
 */

export const dynamic = "force-dynamic";

interface ReportBody {
  profileId?: unknown;
  reason?: unknown;
  details?: unknown;
}

function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

export async function POST(request: Request) {
  try {
    const viewer = await requireViewerProfile();
    const body = await readJson<ReportBody>(request);
    const profileId = body?.profileId;

    if (!isUuid(profileId)) {
      return fail(400, "缺少被举报的会员。");
    }

    if (profileId === viewer.id) {
      return fail(400, "不能举报自己。");
    }

    const reason = body?.reason;

    if (!isReportReason(reason)) {
      return fail(400, "举报理由不合法。");
    }

    const rawDetails = body?.details;
    const details = typeof rawDetails === "string" ? rawDetails : "";

    if (details.length > 2000) {
      return fail(400, "补充说明过长。");
    }

    // details 交给 db 层决定空白是否落成 NULL（它只存有内容的说明）。
    await reportUser({
      reporterId: viewer.id,
      reportedId: profileId,
      reason,
      details,
    });

    return ok({ ok: true }, 201);
  } catch (cause) {
    return errorResponse(cause);
  }
}
