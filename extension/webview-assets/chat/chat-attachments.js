/**
 * Chat Panel — Attachments (paste + drag & drop)
 * Image/file attachments shown under the input box; rendered list +
 * removal. Reads/writes window.ChatState.pastedAttachments.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var inputEl = S.inputEl;
  var inputAttachmentsEl = S.inputAttachmentsEl;
  var inputWrapper = S.inputWrapper;

  // === Paste Image Handler ===
  inputEl.addEventListener("paste", function (e) {
    var items = (e.clipboardData || window.clipboardData).items;
    if (!items) return;

    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        var file = items[i].getAsFile();
        if (!file) continue;

        var reader = new FileReader();
        reader.onload = function (ev) {
          var dataUrl = ev.target.result;
          var name = "pasted-image-" + (S.pastedAttachments.length + 1) + ".png";
          S.pastedAttachments.push({ type: "image", name: name, dataUrl: dataUrl });
          S.renderAttachments();
        };
        reader.readAsDataURL(file);
      }
    }
  });

  // === Drag & Drop Image/File ===
  inputWrapper.addEventListener("dragover", function (e) {
    e.preventDefault();
    inputWrapper.style.borderColor = "var(--vscode-focusBorder, #6366f1)";
  });

  inputWrapper.addEventListener("dragleave", function () {
    inputWrapper.style.borderColor = "";
  });

  inputWrapper.addEventListener("drop", function (e) {
    e.preventDefault();
    inputWrapper.style.borderColor = "";
    var files = e.dataTransfer.files;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.type.indexOf("image") !== -1) {
        var reader = new FileReader();
        reader.onload = (function (f) {
          return function (ev) {
            S.pastedAttachments.push({ type: "image", name: f.name, dataUrl: ev.target.result });
            S.renderAttachments();
          };
        })(file);
        reader.readAsDataURL(file);
      } else {
        S.pastedAttachments.push({ type: "file", name: file.name, dataUrl: null });
        S.renderAttachments();
      }
    }
  });

  S.renderAttachments = function () {
    inputAttachmentsEl.innerHTML = "";
    for (var i = 0; i < S.pastedAttachments.length; i++) {
      var att = S.pastedAttachments[i];
      if (att.type === "image" && att.dataUrl) {
        var wrapper = document.createElement("div");
        wrapper.className = "input-attachment";
        var img = document.createElement("img");
        img.src = att.dataUrl;
        img.alt = att.name;
        wrapper.appendChild(img);
        var removeBtn = document.createElement("button");
        removeBtn.className = "attach-remove";
        removeBtn.textContent = "\u00D7";
        removeBtn.setAttribute("data-idx", i.toString());
        removeBtn.addEventListener("click", function () {
          var idx = parseInt(this.getAttribute("data-idx"));
          S.pastedAttachments.splice(idx, 1);
          S.renderAttachments();
        });
        wrapper.appendChild(removeBtn);
        inputAttachmentsEl.appendChild(wrapper);
      } else {
        var ref = document.createElement("div");
        ref.className = "input-file-ref";
        ref.innerHTML = '<span class="file-ref-icon">\u1F4C4</span>' +
          '<span class="file-ref-name">' + S.escapeHtml(att.name) + '</span>' +
          '<span class="file-ref-remove" data-idx="' + i + '">\u00D7</span>';
        ref.querySelector(".file-ref-remove").addEventListener("click", function () {
          var idx = parseInt(this.getAttribute("data-idx"));
          S.pastedAttachments.splice(idx, 1);
          S.renderAttachments();
        });
        inputAttachmentsEl.appendChild(ref);
      }
    }
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
  };

  S.addFileReference = function (item) {
    if (item.type === "file" || item.type === "folder") {
      S.pastedAttachments.push({ type: "file", name: item.label, dataUrl: null });
      S.renderAttachments();
    }
  };
})();
