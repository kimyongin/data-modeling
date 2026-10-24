import { parse, MAX_BYTES } from "./json.js";
import { validateDocument } from "./validation.js";
import { el, add, p, button } from "./dom.js";
import { createImporter, commitMount } from "./state.js";
import { createWorkspace } from "./workspace.js";
function startViewer() {
  const host = document.getElementById("app"), metadata = JSON.parse(document.getElementById("viewer-data").textContent);
  const engine = globalThis.Viz.instance();
  engine.catch(() => {
  });
  let current;
  const importer = createImporter({
    load: async (file) => {
      if (file.size > MAX_BYTES) throw new Error("JSON은 20MB 이하여야 합니다.");
      const doc = parse(await file.text()), report = await validateDocument(doc);
      return { doc, report, name: file.name };
    },
    prepare: async ({ doc, report, name }) => createWorkspace(doc, report, { engine, onImport: importer, onExport: exportDocument, viewerVersion: metadata.version, filename: name }),
    commit: (candidate) => {
      current = commitMount(host, current, candidate);
    },
    notify: (message, error) => current.notify(message, error)
  });
  async function exportDocument(doc) {
    try {
      await validateDocument(doc);
      const content = JSON.stringify(doc, null, 2) + "\n", url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const a = el("a");
      a.href = url;
      a.download = (doc.document.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80) || "model") + ".model.json";
      a.hidden = true;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
      current.notify("전체 모델 JSON을 내보냈습니다. 현재 필터와 선택 상태는 포함하지 않습니다.");
    } catch (error) {
      current.notify("내보내지 못했습니다. " + error.message, true);
    }
  }
  function emptyView() {
    const root = el("main", null, "app empty-app"), header = el("header", null, "app-header"), brand = add(el("div", null, "brand"), el("h1", "데이터 모델링 뷰어"), p("시작 - 직접 작성하거나 생성한 JSON으로 모델을 검토합니다.", "tab-guide"));
    const input = el("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    input.setAttribute("aria-label", "모델 JSON 선택");
    input.addEventListener("change", () => {
      const file = input.files[0];
      input.value = "";
      if (file) importer(file);
    });
    add(header, brand, button("가져오기", () => input.click()), input);
    const notice = el("div", null, "transfer-notice");
    notice.hidden = true;
    header.append(notice);
    const body = add(el("section", null, "empty-view"), el("h2", "작성한 JSON으로 모델을 검토하세요"), p("요구사항·규칙·모델·샘플을 직접 작성하거나 데이터 모델링 스킬로 생성하세요. 동료에게 받은 JSON도 같은 뷰어에서 엽니다."), p("① 모델 JSON 2.0을 준비합니다.\n② 가져오기에서 파일을 선택합니다.\n③ 스펙·ERD·설명·샘플을 검토합니다.", "steps"), p("스킬의 references/example-model.json을 직접 작성의 시작점으로 사용할 수 있습니다.", "muted"));
    add(root, header, body, add(el("footer", null, "app-footer"), p("인터넷 없이 사용 · 업무 데이터 자동 저장 없음"), p("뷰어 " + metadata.version + " · 문서 형식 2.0.0")));
    return { root, activate() {
    }, dispose() {
    }, notify(message, error) {
      notice.replaceChildren(p(message), button("닫기", () => {
        notice.hidden = true;
      }));
      notice.dataset.error = String(!!error);
      notice.hidden = false;
    } };
  }
  current = emptyView();
  host.replaceChildren(current.root);
  current.activate();
}
if (typeof document !== "undefined") startViewer();
import { observationFingerprint } from "./validation.js";
import { candidateDots } from "./layout.js";
import { graphScope } from "./state.js";
export {
  candidateDots,
  graphScope,
  observationFingerprint,
  parse,
  startViewer,
  validateDocument
};
