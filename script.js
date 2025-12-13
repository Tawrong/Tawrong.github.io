// Basic VTT -> SRT converter and UI wiring
const vttInput = document.getElementById("vttInput");
const fileListEl = document.getElementById("fileList");
const resultListEl = document.getElementById("resultList");
const saveBtn = document.getElementById("saveBtn");
const downloadZipBtn = document.getElementById("downloadZipBtn");
const convertBtn = document.getElementById("convertBtn");
const noFilesNote = document.getElementById("noFilesNote");

let selectedFiles = [];
let convertedFiles = []; // { name, text }

function updateFileListUI() {
  // Clear
  fileListEl.innerHTML = "";
  if (!selectedFiles.length) {
    noFilesNote.style.display = "block";
    convertBtn.disabled = true;
    return;
  }
  noFilesNote.style.display = "none";
  // create list entries
  selectedFiles.forEach((file, i) => {
    const li = document.createElement("li");
    li.style.padding = "6px 0";
    li.textContent = `${file.name} — ${Math.round(file.size / 1024)} KB`;
    fileListEl.appendChild(li);
  });
  convertBtn.disabled = false;
}

vttInput.addEventListener("change", (e) => {
  const list = Array.from(e.target.files || []);
  // Filter files by extension
  selectedFiles = list.filter((f) => f.name.toLowerCase().endsWith(".vtt"));
  if (list.length && selectedFiles.length !== list.length) {
    alert("Some files were ignored because they are not .vtt files.");
  }
  // Clear previous conversion results when selecting new files
  convertedFiles = [];
  resultListEl.innerHTML = "";
  saveBtn.disabled = true;
  downloadZipBtn.disabled = true;
  updateFileListUI();
});

// Convert button click handler
convertBtn.addEventListener("click", async () => {
  resultListEl.innerHTML = "";
  if (!selectedFiles.length) return;
  convertedFiles = [];
  for (const file of selectedFiles) {
    const text = await file.text();
    const srtText = convertVttToSrt(text);
    // Create blob and download link
    const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const li = document.createElement("li");
    li.style.padding = "8px 0";
    const a = document.createElement("a");
    const srtName = file.name.replace(/\.vtt$/i, ".srt");
    a.href = url;
    a.download = srtName;
    a.textContent = `Download ${srtName}`;
    li.appendChild(a);
    resultListEl.appendChild(li);
    convertedFiles.push({ name: srtName, text: srtText });
  }
  // Enable save and ZIP download buttons if we have results
  saveBtn.disabled = !convertedFiles.length;
  downloadZipBtn.disabled = !convertedFiles.length;
});

// Save converted files to a user-selected folder using File System Access API
saveBtn.addEventListener("click", async () => {
  if (!convertedFiles.length) return;

  // If the browser doesn't support showDirectoryPicker, show an informative message
  if (!window.showDirectoryPicker) {
    alert(
      "Direct saving to a local folder is only supported in Chromium-based browsers (Chrome, Edge) that implement the File System Access API. Falling back to downloads."
    );
    // fallback: trigger downloads for each file
    for (const f of convertedFiles) {
      const blob = new Blob([f.text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    return;
  }

  // prevent double-clicking
  saveBtn.disabled = true;
  try {
    const dirHandle = await window.showDirectoryPicker();
    // We'll write each converted file using its srt name.
    for (let i = 0; i < convertedFiles.length; i++) {
      let f = convertedFiles[i];
      let base = f.name; // use original converted name (e.g., original.srt)
      // Write file
      const fileHandle = await dirHandle.getFileHandle(base, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(f.text);
      await writable.close();
    }
    alert("Files saved successfully");
  } catch (err) {
    console.error("Error writing files", err);
    alert(
      "Saving canceled or not permitted. " +
        (err && err.message ? err.message : "")
    );
  } finally {
    saveBtn.disabled = false;
  }
});

// Download all converted files as a single ZIP file using JSZip
downloadZipBtn.addEventListener("click", async () => {
  if (!convertedFiles.length) return;
  // prevent double clicks
  downloadZipBtn.disabled = true;

  if (typeof JSZip === "undefined") {
    // Fallback: download each file separately
    alert(
      "Zipping requires JSZip library. Falling back to downloading files individually."
    );
    for (const f of convertedFiles) {
      const blob = new Blob([f.text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    return;
  }

  try {
    const zip = new JSZip();
    for (const f of convertedFiles) {
      zip.file(f.name, f.text);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const downloadName = "converted-srt-files.zip";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.error("Error creating ZIP", err);
    alert("Error creating ZIP: " + (err && err.message ? err.message : ""));
  } finally {
    downloadZipBtn.disabled = false;
  }
});

// Convert text from WebVTT to SRT format
function convertVttToSrt(vttText) {
  if (!vttText) return "";
  // Normalize line endings
  const lines = vttText.replace(/\r\n?/g, "\n").split("\n");
  let cues = [];
  let i = 0;

  // Skip BOM and WEBVTT header if present
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && lines[i].trim().startsWith("WEBVTT")) {
    i++;
    // skip any header info until empty line
    while (i < lines.length && lines[i].trim() !== "") i++;
  }

  while (i < lines.length) {
    // Skip possible cue identifier line
    let idLine = "";
    if (lines[i] && lines[i].trim() && !lines[i].includes("-->")) {
      idLine = lines[i].trim();
      i++;
    }

    // Find time line
    if (i >= lines.length) break;
    const timeLine = lines[i];
    if (!timeLine.includes("-->")) {
      // Skip lines until next cue marker
      i++;
      continue;
    }
    i++;
    // Gather text lines
    let textLines = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i++;
    }
    // Move past blank line separator
    while (i < lines.length && lines[i].trim() === "") i++;

    const times = parseVttTimeLine(timeLine);
    if (!times) continue;
    cues.push({ start: times[0], end: times[1], text: textLines.join("\n") });
  }

  // Build SRT
  const srtLines = [];
  for (let idx = 0; idx < cues.length; idx++) {
    const cue = cues[idx];
    srtLines.push((idx + 1).toString());
    srtLines.push(
      `${formatTimeForSrt(cue.start)} --> ${formatTimeForSrt(cue.end)}`
    );
    srtLines.push(cue.text);
    srtLines.push("");
  }
  return srtLines.join("\n");
}

function parseVttTimeLine(line) {
  // capture two timestamps ignoring any cue settings
  const regex =
    /(?:(\d{1,2}:)?\d{1,2}:\d{2}\.\d{3})\s*-->\s*(?:(\d{1,2}:)?\d{1,2}:\d{2}\.\d{3})/;
  const m = line.match(regex);
  if (!m) return null;
  // Extract full times from the matched portion
  const parts = m[0].split("-->");
  if (parts.length < 2) return null;
  const start = parts[0].trim();
  const end = parts[1].trim();
  return [start, end];
}

function formatTimeForSrt(timeStr) {
  // Ensure hh:mm:ss,ms format
  // Convert VTT 00:00:00.000 to 00:00:00,000
  let t = timeStr.trim();
  // If it's mm:ss.xxx, add 00: prefix
  const mmss = /^\d{1,2}:\d{2}\.\d{3}$/;
  if (mmss.test(t)) t = "00:" + t;
  // Replace '.' before milliseconds with ','
  t = t.replace(/\.(\d{3})$/, ",$1");
  // Ensure hh has two digits
  const parts = t.split(":");
  for (let i = 0; i < parts.length; i++)
    if (parts[i].length === 1) parts[i] = "0" + parts[i];
  return parts.join(":");
}

// initial UI update
updateFileListUI();
