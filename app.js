
(() => {
  const $ = id => document.getElementById(id);

  const cfg = window.APP_CONFIG || {};

  const configured =
    cfg.SUPABASE_URL &&
    !cfg.SUPABASE_URL.includes("YOUR-PROJECT") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("YOUR_");

  const db = configured
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;

  let user = null;
  let profile = null;
  let reviewStatus = "pending";
  let reviewRows = [];

  const toast = msg => {
    $("toast").textContent = msg;
    $("toast").classList.add("show");

    setTimeout(() => {
      $("toast").classList.remove("show");
    }, 2600);
  };

  const esc = s =>
    String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const showModal = html => {
    $("modalContent").innerHTML = html;
    $("modal").classList.remove("hidden");
  };

  const closeModal = () => {
    $("modal").classList.add("hidden");
  };

  const confirmBox = (title, body, yes, danger = false) => {
    showModal(`
      <h3>${title}</h3>
      <p>${body}</p>
      <div class="modal-buttons">
        <button class="btn secondary" id="cancelModal">Không</button>
        <button class="btn ${danger ? "danger" : "primary"}" id="confirmModal">
          Có, tiếp tục
        </button>
      </div>
    `);
  };

  const dateText = d =>
    new Date(d).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short"
    });

  function setTheme(dark) {
    document.body.classList.toggle("dark", dark);

    localStorage.setItem(
      "cfs-theme",
      dark ? "dark" : "light"
    );
  }

  function authMode(mode) {
    $("loginForm").classList.toggle(
      "hidden",
      mode !== "login"
    );

    $("signupForm").classList.toggle(
      "hidden",
      mode !== "signup"
    );
  }

  function enterApp() {
    $("authView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    const name = profile?.full_name || "bạn";

    $("welcomeName").textContent = name;
    $("identityName").textContent = name;
    $("userLabel").textContent = name;
    $("settingsName").value = name;

    document.querySelectorAll(".admin-only").forEach(x => {
      x.classList.toggle(
        "hidden",
        profile?.role !== "admin"
      );
    });

    goPage("home");
    refreshPending();
  }

  function leaveApp() {
    user = null;
    profile = null;

    $("appView").classList.add("hidden");
    $("authView").classList.remove("hidden");

    authMode("login");
  }

  async function loadProfile() {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    profile = data;
  }

  async function refreshPending() {
    if (profile?.role !== "admin") return;

    const { count, error } = await db
      .from("confessions")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("status", "pending");

    if (error) {
      console.error(error);
      return;
    }

    $("pendingBadge").textContent = count || 0;
    $("pendingCount").textContent = count || 0;
  }

  function goPage(page) {
    if (page === "review" && profile?.role !== "admin") {
      page = "home";
    }

    document.querySelectorAll(".page").forEach(p => {
      p.classList.add("hidden");
    });

    $("page-" + page).classList.remove("hidden");

    document.querySelectorAll("[data-page]").forEach(b => {
      b.classList.toggle(
        "active",
        b.dataset.page === page
      );
    });

    if (page === "feed") loadFeed();
    if (page === "review") loadReview();

    if (page === "settings") {
      $("settingsName").value = profile.full_name;
    }
  }
  // ============================================
// LÀM MỚI DỮ LIỆU TỪNG TRANG
// ============================================

async function refreshSection(section, button) {
  if (!user || !db) return;

  const oldHTML = button.innerHTML;

  button.disabled = true;
  button.classList.add("is-loading");

  button.innerHTML = `
    <span class="reload-symbol">↻</span>
    Đang tải...
  `;

  try {
    switch (section) {

      case "home":
        await loadProfile();

        $("welcomeName").textContent =
          profile?.full_name || "bạn";

        $("identityName").textContent =
          profile?.full_name || "bạn";

        $("userLabel").textContent =
          profile?.full_name || "Tài khoản";

        await refreshPending();

        toast("Đã cập nhật trang chủ.");
        break;

      case "feed":
        await loadFeed();

        toast("Đã cập nhật bảng tin.");
        break;

      case "review":
        await loadReview();
        await refreshPending();

        toast("Đã cập nhật danh sách duyệt bài.");
        break;

      case "settings":
        await loadProfile();

        $("settingsName").value =
          profile?.full_name || "";

        toast("Đã cập nhật thông tin tài khoản.");
        break;

    }

  } catch (error) {
    console.error("Refresh error:", error);
    toast("Không thể tải lại: " + error.message);

  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.innerHTML = oldHTML;
  }
}

// Gắn sự kiện cho các nút tải lại
document.querySelectorAll("[data-refresh]").forEach(button => {
  button.addEventListener("click", () => {
    refreshSection(button.dataset.refresh, button);
  });
});

  // =====================================================
  // BẢNG TIN
  // Không truy vấn profiles thông qua confessions
  // để tránh lỗi nhiều quan hệ khóa ngoại.
  // =====================================================

  async function loadFeed() {
    const box = $("feedList");
    box.innerHTML = `<p class="muted">Đang tải bảng tin...</p>`;
    const { data, error } = await db.from("confessions").select(`
      id, content, post_number, approved_at, created_at,
      likes(count), comments(id, user_id, content, created_at, parent_id)
    `).eq("status", "approved")
      .order("post_number", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) { box.textContent = error.message; return; }
    if (!data?.length) {
      box.innerHTML = `<div class="card post-card muted">Chưa có bài viết nào được đăng. Hãy quay lại sau nhé!</div>`;
      return;
    }

    const grouped = new Map();
    data.forEach(c => {
      const key = c.post_number ?? `single-${c.id}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(c);
    });

    const posts = [...grouped.values()];
    const commenterIds = [...new Set(posts.flat().flatMap(c => (c.comments || []).map(x => x.user_id)).filter(Boolean))];
    let commenterMap = {};
    if (commenterIds.length) {
      const { data: people, error: peopleError } = await db.from("profiles")
        .select("id, full_name").in("id", commenterIds);
      if (peopleError) { box.textContent = "Không tải được tên người bình luận: " + peopleError.message; return; }
      commenterMap = Object.fromEntries((people || []).map(p => [p.id, p.full_name]));
    }

    box.innerHTML = posts.map(items => {
      const first = items[0];
      const anchorId = first.id;
      const allComments = items.flatMap(c => c.comments || []);
      const likeCount = first.likes?.[0]?.count || 0;
      const commentIds = new Set(allComments.map(c => c.id));
      const commentById = new Map(allComments.map(c => [c.id, c]));

      const renderComment = (c, depth = 0) => {
        const replies = allComments.filter(x => x.parent_id === c.id)
          .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
        const authorName = commenterMap[c.user_id] || "Tài khoản";
        const parentComment = c.parent_id ? commentById.get(c.parent_id) : null;
        const parentName = parentComment ? (commenterMap[parentComment.user_id] || "Tài khoản") : "";
        return `<div class="comment ${depth ? "reply-hint" : ""}" style="margin-left:${Math.min(depth,3)*22}px">
          ${parentComment ? `<div class="comment-reply-context"><b>${esc(authorName)}</b> đã trả lời <b>${esc(parentName)}</b></div>` : `<b>${esc(authorName)}</b>`}
          <div class="comment-content">${esc(c.content)}</div>
          <div class="comment-tools"><small>${dateText(c.created_at)}</small>
            <button type="button" class="text-btn reply-comment" data-reply="${c.id}">Trả lời</button>
          </div>
          <form class="comment-form reply-form hidden" data-comment="${anchorId}" data-parent="${c.id}">
            <input name="content" placeholder="Viết câu trả lời..." maxlength="500" required>
            <button type="submit" class="btn primary small-btn">Gửi</button>
          </form>
          ${replies.map(r => renderComment(r, depth + 1)).join("")}
        </div>`;
      };
      const roots = allComments.filter(c => !c.parent_id || !commentIds.has(c.parent_id))
        .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

      return `<article class="card post-card">
        <div class="post-top">
          <span class="post-number">#${first.post_number || "—"} <span class="muted">Confessions lúc ${dateText(first.approved_at || first.created_at)}</span></span>
          ${profile?.role === "admin" ? `<span class="muted">${items.length} confession</span>` : ""}
        </div>
        <div class="post-confessions">
          ${items.map((c,i) => `<div class="post-confession">
            <div class="post-body"><b>#Cfs ${i+1}:</b> ${esc(c.content)}</div>
            ${profile?.role === "admin" ? `<button class="icon-btn confession-delete" title="Xóa confession này" data-delete-confession="${c.id}">🗑</button>` : ""}
          </div>`).join("")}
        </div>
        <div class="post-actions">
   <button type="button" class="action-btn"
  data-like="${anchorId}" aria-pressed="false">
  ♡ Thích <span>${likeCount}</span>
</button>
  
</button>
          <button class="action-btn" data-comments="${anchorId}">▢ Bình luận (${allComments.length})</button>
        </div>
        <div class="comment-area hidden" id="comments-${anchorId}">
          <div class="comment-list">${roots.map(c => renderComment(c)).join("") || `<p class="muted">Chưa có bình luận nào.</p>`}</div>
          <form class="comment-form" data-comment="${anchorId}">
            <input name="content" placeholder="Viết bình luận..." maxlength="500" required>
            <button type="submit" class="btn primary small-btn">Gửi</button>
          </form>
        </div>
      </article>`;
    }).join("");
  }

  // =====================================================
  // QUẢN LÝ DUYỆT CONFESSION
  // Lấy profiles riêng bằng user_id.
  // Không dùng profiles(...) trong truy vấn confessions.
  // =====================================================

  async function loadReview() {
    const box = $("reviewList");

    box.innerHTML = `
      <p class="muted">Đang tải...</p>
    `;

    let q = db
      .from("confessions")
      .select(`
        id,
        user_id,
        content,
        status,
        created_at
      `)
      .order("created_at", {
        ascending: false
      });

    if (reviewStatus !== "all") {
      q = q.eq("status", reviewStatus);
    }

    const { data, error } = await q;

    if (error) {
      box.textContent = error.message;
      return;
    }

    const rows = data || [];

    reviewRows = rows;

    // Lấy danh sách user_id không trùng nhau
    const userIds = [
      ...new Set(
        rows
          .map(p => p.user_id)
          .filter(Boolean)
      )
    ];

    let profileMap = {};

    // Truy vấn profiles riêng biệt
    if (userIds.length > 0) {
      const {
        data: profiles,
        error: profileError
      } = await db
        .from("profiles")
        .select("id,full_name,email")
        .in("id", userIds);

      if (profileError) {
        box.textContent =
          "Không tải được thông tin người gửi: " +
          profileError.message;

        return;
      }

      profileMap = Object.fromEntries(
        (profiles || []).map(p => [
          p.id,
          p
        ])
      );
    }

    if (!rows.length) {
      box.innerHTML = `
        <div class="card post-card muted">
          Không có bài viết trong mục này.
        </div>
      `;

      updateSelected();
      return;
    }

    box.innerHTML = rows.map(p => {
      const author = profileMap[p.user_id];

      return `
        <article class="review-card">

          <input
            type="checkbox"
            class="review-check"
            value="${p.id}"
            ${p.status !== "pending" ? "disabled" : ""}
            aria-label="Chọn confession đang chờ duyệt"
          >

          <div>

            <div class="review-meta">

              <b>
                ${esc(author?.full_name || "Không rõ")}
              </b>

              · ${esc(author?.email || "")}

              · ${dateText(p.created_at)}

              · <b>${esc(p.status)}</b>

            </div>

            <div class="review-content">
              ${esc(p.content)}
            </div>

            <div class="review-actions">

              ${
                p.status !== "approved"
                  ? `
                    <button
                      class="btn primary small-btn"
                      data-approve="${p.id}"
                    >
                      ✓ Duyệt
                    </button>
                  `
                  : ""
              }

              ${
                p.status !== "rejected"
                  ? `
                    <button
                      class="btn secondary small-btn"
                      data-reject="${p.id}"
                    >
                      Không duyệt
                    </button>
                  `
                  : ""
              }

              <button
                class="btn danger small-btn"
                data-admin-delete="${p.id}"
              >
                Xóa
              </button>

            </div>

          </div>

        </article>
      `;
    }).join("");

    updateSelected();
  }

  function updateSelected() {
    const n = document.querySelectorAll(
      ".review-check:checked:not(:disabled)"
    ).length;

    const pendingCount = (reviewRows || []).filter(
      row => row.status === "pending"
    ).length;

    $("selectedCount").textContent = n + " đã chọn";
    const selectAll = $("selectAll");
    if (selectAll) {
      selectAll.disabled = pendingCount === 0;
      selectAll.checked = pendingCount > 0 &&
        document.querySelectorAll(".review-check:not(:disabled):checked").length === pendingCount;
      selectAll.indeterminate = n > 0 && n < pendingCount;
    }
    const bulkButton = $("bulkApprove");
    if (bulkButton) bulkButton.disabled = n === 0;
  }

  async function moderate(id, status) {
    let error;
    if (status === "approved") {
      ({ error } = await db.rpc("approve_confessions", { confession_ids: [id] }));
    } else {
      ({ error } = await db.from("confessions")
        .update({ status, approved_at: null }).eq("id", id));
    }

    if (error) {
      toast(error.message);
    } else {
      toast(
        status === "approved"
          ? "Đã duyệt confession."
          : "Đã chuyển sang không duyệt."
      );

      loadReview();
      refreshPending();
    }
  }

  async function approveSelected() {
    // Chỉ gửi các ID còn ở trạng thái pending theo dữ liệu vừa tải
    // và không tin cậy checkbox phía trình duyệt làm nguồn phân quyền.
    const pendingIds = new Set(
      (reviewRows || [])
        .filter(row => row.status === "pending")
        .map(row => row.id)
    );
    const ids = [
      ...document.querySelectorAll(".review-check:checked:not(:disabled)")
    ].map(x => x.value).filter(id => pendingIds.has(id));

    if (!ids.length) {
      toast("Bạn hãy chọn ít nhất một CFS đang chờ duyệt.");
      return;
    }

    const { data, error } = await db.rpc(
      "approve_confessions",
      {
        confession_ids: ids
      }
    );

    if (error) {
      toast(
        "Không thể duyệt hàng loạt: " +
        error.message
      );

      return;
    }

    toast(
      "Đã tạo 1 bài viết gồm " + ids.length + " confession."
    );

    $("selectAll").checked = false;

    loadReview();
    refreshPending();
  }

  // =====================================================
  // BÌNH LUẬN
  // =====================================================

  async function sendComment(form) {
    if (!user) { toast("Bạn cần đăng nhập để bình luận."); return; }
    const id = form.dataset.comment;
    const content = String(new FormData(form).get("content") || "").trim();
    const parentId = form.dataset.parent || null;
    if (!content) return;

    const submitButton = form.querySelector('button[type="submit"], button:not([type])');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Đang gửi..."; }

    const { data: inserted, error } = await db.from("comments").insert({
      confession_id: id, user_id: user.id, parent_id: parentId, content
    }).select("id, user_id, content, created_at, parent_id").single();

    if (error) {
      toast(error.message);
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Gửi"; }
      return;
    }

    // Cập nhật trực tiếp DOM: không tải lại bảng tin/trang.
    const name = profile?.full_name || "Tài khoản";
    const parentHeader = parentId ? form.closest(".comment")?.querySelector(":scope > b, :scope > .comment-reply-context") : null;
    const parentName = parentHeader?.querySelector("b:last-child")?.textContent || parentHeader?.textContent?.trim() || "người dùng";
    const commentHtml = `<div class="comment ${parentId ? "reply-hint" : ""}" data-comment-id="${inserted.id}">
      ${parentId ? `<div class="comment-reply-context"><b>${esc(name)}</b> đã trả lời <b>${esc(parentName)}</b></div>` : `<b>${esc(name)}</b>`}
      <div class="comment-content">${esc(inserted.content)}</div>
      <div class="comment-tools"><small>${dateText(inserted.created_at)}</small>
        <button type="button" class="text-btn reply-comment" data-reply="${inserted.id}">Trả lời</button>
      </div>
      <form class="comment-form reply-form hidden" data-comment="${id}" data-parent="${inserted.id}">
        <input name="content" placeholder="Viết câu trả lời..." maxlength="500" required>
        <button type="submit" class="btn primary small-btn">Gửi</button>
      </form>
    </div>`;

    if (parentId) {
      const parentComment = form.closest(".comment");
      form.insertAdjacentHTML("afterend", commentHtml);
      form.reset();
      form.classList.add("hidden");
      // Giữ các trả lời cũ nằm sau câu trả lời mới.
      if (parentComment) {
        const newComment = form.nextElementSibling;
        if (newComment) parentComment.appendChild(newComment);
      }
    } else {
      const list = $("comments-" + id)?.querySelector(".comment-list");
      if (list) {
        list.querySelector(".muted")?.remove();
        list.insertAdjacentHTML("beforeend", commentHtml);
      }
      form.reset();
    }

    const countButton = [...document.querySelectorAll(`[data-comments="${CSS.escape(id)}"]`)][0];
    if (countButton) {
      const match = countButton.textContent.match(/\((\d+)\)/);
      const count = match ? Number(match[1]) + 1 : 1;
      countButton.textContent = `▢ Bình luận (${count})`;
    }
    $("comments-" + id)?.classList.remove("hidden");
    toast(parentId ? "Đã gửi câu trả lời." : "Đã gửi bình luận.");
  }

  // =====================================================
  // ĐĂNG NHẬP VÀ ĐĂNG KÝ
  // =====================================================

  async function handleAuth() {
    if (!db) {
      toast(
        "Bạn cần cấu hình Supabase trong config.js trước."
      );

      return;
    }

    const { data } = await db.auth.getSession();

    if (data.session) {
      user = data.session.user;

      try {
        await loadProfile();
        enterApp();
      } catch (e) {
        toast(
          "Không tải được hồ sơ: " + e.message
        );
      }
    }
  }

  $("loginBtn").onclick = async () => {
    if (!db) {
      return toast(
        "Hãy cấu hình Supabase trong config.js."
      );
    }

    const { data, error } = await db.auth
      .signInWithPassword({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value
      });

    if (error) {
      return toast(error.message);
    }

    user = data.user;

    try {
      await loadProfile();
      enterApp();
    } catch (e) {
      toast(
        "Không tải được hồ sơ: " + e.message
      );
    }
  };

  $("signupBtn").onclick = async () => {
    if (!db) {
      return toast(
        "Hãy cấu hình Supabase trong config.js."
      );
    }

    const full_name =
      $("signupName").value.trim();

    const email =
      $("signupEmail").value.trim();

    const password =
      $("signupPassword").value;

    if (!full_name || !email || !password) {
      return toast(
        "Vui lòng nhập đầy đủ thông tin."
      );
    }

    if (password.length < 6) {
      return toast(
        "Mật khẩu cần ít nhất 6 ký tự."
      );
    }

    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name
        }
      }
    });

    if (error) {
      return toast(error.message);
    }

    if (data.session) {
      user = data.user;

      try {
        await loadProfile();
        enterApp();
      } catch (e) {
        toast(
          "Không tải được hồ sơ: " + e.message
        );
      }
    } else {
      toast(
        "Đăng ký thành công. Hãy kiểm tra email để xác nhận tài khoản."
      );
    }
  };

  document.querySelectorAll("[data-switch]").forEach(b => {
    b.onclick = () => authMode(b.dataset.switch);
  });

  // =====================================================
  // HƯỚNG DẪN ĐẶT TÊN
  // =====================================================

  $("nameHelp").onclick = () => {
    showModal(`
      <h3>Gợi ý đặt tên hiển thị</h3>

      <p>
        Chào bạn, hãy đặt tên của bạn như sau ví dụ
        bạn tên Ngọc Nhung học ở lớp 9A1.
        Thì bạn sẽ đặt là “Ngọc Nhung 9A1” vì tên
        của bạn sẽ xuất hiện ở phần comment bài viết,
        và nó ẩn danh khi bạn gửi CFS.
        Khi đăng ký, bạn đồng ý sử dụng nền tảng
        một cách văn minh, tôn trọng và không chia sẻ
        thông tin gây tổn hại đến người khác.
      </p>

      <div class="modal-buttons">
        <button class="btn primary" id="understood">
          Đã hiểu
        </button>
      </div>
    `);
  };

  // =====================================================
  // MODAL
  // =====================================================

  $("modalClose").onclick = closeModal;

  $("modal").onclick = e => {
    if (e.target === $("modal")) {
      closeModal();
    }
  };

  $("modalContent").addEventListener("click", e => {
    if (
      e.target.id === "understood" ||
      e.target.id === "cancelModal"
    ) {
      closeModal();
    }

    if (e.target.id === "confirmModal") {
      const fn = window.__confirmAction;

      closeModal();

      fn?.();
    }
  });

  // =====================================================
  // GỬI CONFESSION
  // =====================================================

  $("sendConfession").onclick = async () => {
    const content =
      $("confessionText").value.trim();

    if (!content) {
      return toast(
        "Bạn hãy nhập nội dung confession."
      );
    }

    const { error } = await db
      .from("confessions")
      .insert({
        user_id: user.id,
        content
      });

    if (error) {
      return toast(error.message);
    }

    $("confessionText").value = "";

    $("charCount").textContent = "0/3000";

    toast(
      "Đã gửi! Confession đang chờ Admin duyệt."
    );
  };

  $("confessionText").oninput = () => {
    $("charCount").textContent =
      $("confessionText").value.length + "/3000";
  };

  // =====================================================
  // ĐIỀU HƯỚNG TRANG
  // =====================================================

  document.querySelectorAll("[data-page]").forEach(b => {
    b.onclick = () => goPage(b.dataset.page);
  });

  // =====================================================
  // GIAO DIỆN SÁNG / TỐI
  // =====================================================

  $("themeBtn").onclick = () => {
    setTheme(
      !document.body.classList.contains("dark")
    );
  };

  $("settingsTheme").onclick = () => {
    setTheme(
      !document.body.classList.contains("dark")
    );
  };

  setTheme(
    localStorage.getItem("cfs-theme") === "dark"
  );

  // =====================================================
  // TÀI KHOẢN VÀ ĐĂNG XUẤT
  // =====================================================

  $("userBtn").onclick = () => {
    $("userDropdown").classList.toggle("hidden");
  };

  $("quickLogout").onclick = () => askLogout();

  $("logoutBtn").onclick = () => askLogout();

  function askLogout() {
    confirmBox(
      "Đăng xuất?",
      "Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không?"
    );

    window.__confirmAction = async () => {
      await db.auth.signOut();
      leaveApp();
    };
  }

  // =====================================================
  // ĐỔI TÊN HIỂN THỊ
  // =====================================================

  $("saveName").onclick = async () => {
    const full_name =
      $("settingsName").value.trim();

    if (!full_name) {
      return toast(
        "Tên không được để trống."
      );
    }

    const { error } = await db
      .from("profiles")
      .update({
        full_name
      })
      .eq("id", user.id);

    if (error) {
      return toast(error.message);
    }

    profile.full_name = full_name;

    enterApp();

    toast("Đã cập nhật họ tên.");
  };

  // =====================================================
  // XÓA TÀI KHOẢN
  // =====================================================

  $("deleteAccountBtn").onclick = () => {
    showModal(`
      <h3>Xóa tài khoản</h3>

      <p>
        Nhập mật khẩu để xác nhận danh tính.
        Tài khoản và dữ liệu hồ sơ của bạn sẽ bị xóa.
      </p>

      <label>Mật khẩu hiện tại</label>

      <input
        id="deletePassword"
        type="password"
        placeholder="Nhập mật khẩu"
      >

      <div class="modal-buttons">
        <button class="btn secondary" id="cancelModal">
          Hủy
        </button>

        <button class="btn danger" id="confirmDelete">
          Xóa tài khoản
        </button>
      </div>
    `);
  };

  $("modalContent").addEventListener("click", async e => {
    if (e.target.id === "confirmDelete") {
      const pw = $("deletePassword").value;

      const { error: verifyErr } =
        await db.auth.signInWithPassword({
          email: user.email,
          password: pw
        });

      if (verifyErr) {
        return toast(
          "Mật khẩu không chính xác."
        );
      }

      const { error } = await db.rpc(
        "delete_own_account"
      );

      if (error) {
        return toast(
          "Không thể xóa: " + error.message
        );
      }

      closeModal();

      leaveApp();

      toast("Tài khoản đã được xóa.");
    }
  });

  // =====================================================
  // QUẢN LÝ DUYỆT BÀI
  // =====================================================

  document.querySelectorAll(".tab").forEach(b => {
    b.onclick = () => {
      reviewStatus = b.dataset.status;

      document.querySelectorAll(".tab").forEach(x => {
        x.classList.toggle(
          "active",
          x === b
        );
      });

      loadReview();
    };
  });

  $("selectAll").onchange = e => {
    document.querySelectorAll(".review-check:not(:disabled)").forEach(x => {
      x.checked = e.target.checked;
    });

    updateSelected();
  };

  $("bulkApprove").onclick = approveSelected;

  $("reviewList").addEventListener("change", e => {
    if (e.target.classList.contains("review-check")) {
      updateSelected();
    }
  });

  $("reviewList").addEventListener("click", e => {
    const b = e.target.closest("button");

    if (!b) return;

    if (b.dataset.approve) {
      moderate(b.dataset.approve, "approved");
    }

    if (b.dataset.reject) {
      moderate(b.dataset.reject, "rejected");
    }

    if (b.dataset.adminDelete) {
      const id = b.dataset.adminDelete;

      confirmBox(
        "Xóa confession?",
        "Bài viết sẽ bị xóa vĩnh viễn."
      );

      window.__confirmAction = async () => {
        const { error } = await db
          .from("confessions")
          .delete()
          .eq("id", id);

        toast(
          error?.message || "Đã xóa bài viết."
        );

        loadReview();
      };
    }
  });

  // =====================================================
  // THÍCH, MỞ BÌNH LUẬN, XÓA BÀI
  // =====================================================

  $("feedList").addEventListener("click", async e => {
    const b = e.target.closest("button");

    if (!b) return;

    if (b.dataset.comments) {
      $("comments-" + b.dataset.comments).classList.toggle("hidden");
    }

    if (b.dataset.reply) {
      const form = b.closest(".comment").querySelector(":scope > .reply-form");
      if (form) form.classList.toggle("hidden");
    }

    if (b.dataset.deleteConfession) {
      const id = b.dataset.deleteConfession;
      confirmBox("Xóa confession?", "Chỉ confession này sẽ bị xóa khỏi bài viết.");
      window.__confirmAction = async () => {
        const { error } = await db.from("confessions").delete().eq("id", id);
        if (error) toast(error.message);
        else { toast("Đã xóa confession."); loadFeed(); }
      };
    }

    if (b.dataset.like) {
      if (!user) { toast("Bạn cần đăng nhập để thả cảm xúc."); return; }
      const confessionId = b.dataset.like;
      b.disabled = true;
      const { data: existing, error: findError } = await db
        .from("likes")
        .select("confession_id")
        .eq("confession_id", confessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (findError) {
        toast(findError.message);
        b.disabled = false;
        return;
      }

      let actionError = null;
      if (existing) {
        const result = await db.from("likes").delete()
          .eq("confession_id", confessionId).eq("user_id", user.id);
        actionError = result.error;
      } else {
        const result = await db.from("likes").insert({
          confession_id: confessionId, user_id: user.id
        });
        actionError = result.error;
      }

      if (actionError) {
        toast(actionError.message);
      } else {
        const countSpan = b.querySelector("span");
        const count = Number(countSpan?.textContent || 0) + (existing ? -1 : 1);
        if (countSpan) countSpan.textContent = String(Math.max(0, count));
        b.classList.toggle("liked", !existing);
        b.setAttribute("aria-pressed", String(!existing));
      }
      b.disabled = false;
    }

    if (b.dataset.deletePost) {
      const id = b.dataset.deletePost;

      confirmBox(
        "Xóa bài viết?",
        "Bạn có chắc chắn muốn xóa confession này?"
      );

      window.__confirmAction = async () => {
        const { error } = await db
          .from("confessions")
          .delete()
          .eq("id", id);

        toast(
          error?.message || "Đã xóa."
        );

        loadFeed();
      };
    }
  });

  // =====================================================
  // GỬI BÌNH LUẬN
  // =====================================================

  $("feedList").addEventListener("submit", e => {
    if (e.target.matches(".comment-form")) {
      e.preventDefault();
      sendComment(e.target);
    }
  });

  // =====================================================
  // SPLASH SCREEN
  // =====================================================

  $("splash").classList.remove("hidden");

  setTimeout(() => {
    $("splash").classList.add("hidden");

    $("authView").classList.remove("hidden");

    if (configured) {
      handleAuth();
    }
  }, 2000);

  // =====================================================
  // SERVICE WORKER
  // =====================================================

 if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .catch(() => {});
    });
  }

})();
