// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDDw17I5NwibE9BXl0YoILPQqoPQfCKH4Q",
  authDomain: "inbound-d8267.firebaseapp.com",
  databaseURL: "https://inbound-d8267-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "inbound-d8267",
  storageBucket: "inbound-d8267.firebasestorage.app",
  messagingSenderId: "852665126418",
  appId: "1:852665126418:web:e4f029b83995e29f3052cb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const table = $("#containerTable").DataTable();
const csvInput = document.getElementById("csvFile");
const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");
let selectedFile = null;
let firebaseRecords = {}; // mirip airtableRecords sebelumnya

// Batch upload
const batchCsvInput = document.getElementById("batchCsvFiles");
const batchUploadBtn = document.getElementById("batchUploadBtn");
const batchUploadStatus = document.getElementById("batchUploadStatus");
let selectedBatchFiles = [];

function showStatus(message, type = "info") {
  uploadStatus.textContent = message;
  uploadStatus.className = `status ${type}`;
}
function showBatchStatus(message, type = "info") {
  batchUploadStatus.textContent = message;
  batchUploadStatus.className = `status ${type}`;
}

function getStatusProgress(timeIn, unloadingTime, finish) {
  timeIn = (timeIn || "").trim();
  unloadingTime = (unloadingTime || "").trim();
  finish = (finish || "").trim();
  if ([timeIn, unloadingTime, finish].some(val => val === "0")) return "Reschedule";
  if ([timeIn, unloadingTime, finish].every(val => val === "")) return "Outstanding";
  if ([timeIn, unloadingTime, finish].every(val => val === "-")) return "Reschedule";
  if (timeIn && (!unloadingTime || unloadingTime === "-")) return "Waiting";
  if (timeIn && unloadingTime && (!finish || finish === "-")) return "Processing";
  if (timeIn && unloadingTime && finish) return "Finish";
  return "";
}
function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const shortYear = year.toString().slice(-2);
  return `${day}-${monthNames[month]}-${shortYear}`;
}

function renderRow(row, index, id) {
  const feet = row["FEET"]?.trim().toUpperCase();
  const packageVal = row["PACKAGE"]?.trim().toUpperCase();
  let np20 = "", np40 = "", p20 = "", p40 = "";
  const isBag = packageVal.includes("BAG");

  if (feet === '1X20' && isBag) np20 = '✔';
  else if (feet === '1X40' && isBag) np40 = '✔';
  else if (feet === '1X20' && !isBag) p20 = '✔';
  else if (feet === '1X40' && !isBag) p40 = '✔';

  const timeIn = row["TIME IN"] || "";
  const unloadingTime = row["UNLOADING TIME"] || "";
  const finish = row["FINISH"] || "";
  const status = getStatusProgress(timeIn, unloadingTime, finish);

  return `
    <tr data-id="${id}">
      <td></td>
      <td>${row["NO CONTAINER"] || ""}</td>
      <td>${feet}</td>
      <td>${np20}</td>
      <td>${np40}</td>
      <td>${p20}</td>
      <td>${p40}</td>
      <td>${row["INVOICE NO"] || ""}</td>
      <td>${row["PACKAGE"] || ""}</td>
      <td>${formatDate(row["INCOMING PLAN"])}</td>
      <td class="status-progress"><span class="label label-${status.toLowerCase()}">${status}</span></td>
      <td contenteditable class="editable time-in">${timeIn}</td>
      <td contenteditable class="editable unloading-time">${unloadingTime}</td>
      <td contenteditable class="editable finish">${finish}</td>
    </tr>`;
}

function loadFirebaseData() {
  db.ref("incoming_schedule").once("value").then(snapshot => {
    table.clear();
    firebaseRecords = snapshot.val() || {};
    Object.entries(firebaseRecords).forEach(([id, data], i) => {
      const html = renderRow(data, i, id);
      if (html) table.row.add($(html));
    });
    table.draw();
    table.on('order.dt search.dt', function () {
      table.column(0, { search: 'applied', order: 'applied' }).nodes().each(function (cell, i) {
        cell.innerHTML = i + 1;
      });
    }).draw();
  });
}

function updateFirebaseField(recordId, timeInRaw, unloadingTimeRaw, finishRaw) {
  const timeIn = (timeInRaw || "-").trim();
  const unloadingTime = (unloadingTimeRaw || "-").trim();
  const finish = (finishRaw || "-").trim();
  const status = getStatusProgress(timeIn, unloadingTime, finish);

  db.ref(`incoming_schedule/${recordId}`).update({
    "TIME IN": timeIn,
    "UNLOADING TIME": unloadingTime,
    "FINISH": finish
  }).then(() => {
    const row = document.querySelector(`tr[data-id='${recordId}']`);
    if (row) {
      row.querySelector(".status-progress").innerHTML = `<span class="label label-${status.toLowerCase()}">${status}</span>`;
    }
  });
}

function deleteAllFirebaseRecords() {
  return db.ref("incoming_schedule").remove();
}

function uploadToFirebase(records) {
  const updates = {};
  records.forEach((row, index) => {
    const id = row["NO CONTAINER"]?.trim() || `id_${Date.now()}_${index}`;
    updates[id] = row;
  });
  return db.ref("incoming_schedule").update(updates);
}

function parseAndUploadCSV(file) {
  showStatus("⏳ Sedang memproses file CSV...", "info");
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async function (results) {
      const rows = results.data;
      try {
        showStatus("🗑 Menghapus data lama dari Database...", "info");
        await deleteAllFirebaseRecords();

        showStatus("📤 Mengupload data baru ke Database...", "info");
        await uploadToFirebase(rows);

        showStatus("✅ Upload selesai!", "success");
        document.getElementById("csvFile").value = "";
        setTimeout(() => showStatus("", ""), 3000);
        loadFirebaseData();
      } catch (err) {
        console.error(err);
        showStatus("❌ Gagal upload data!", "error");
      }
    }
  });
}

// ---------------------- BATCH UPLOAD LOGIC -----------------------

batchCsvInput.addEventListener("change", function (e) {
  selectedBatchFiles = Array.from(e.target.files);
  if (selectedBatchFiles.length > 0) {
    showBatchStatus(`📁 ${selectedBatchFiles.length} file siap diupload. Klik tombol Batch Upload.`, "info");
  } else {
    showBatchStatus("", "info");
  }
});

batchUploadBtn.addEventListener("click", function () {
  if (selectedBatchFiles.length === 0) {
    showBatchStatus("⚠️ Silakan pilih file-file CSV terlebih dahulu!", "error");
    return;
  }
  batchUploadCSVs(selectedBatchFiles);
});

function batchUploadCSVs(files) {
  showBatchStatus("⏳ Memproses semua file...", "info");

  let total = files.length;
  let done = 0;
  let failed = 0;
  let failedFiles = [];

  function normalizeKey(key) {
    return String(key).replace(/[\s_]+/g, "").replace(/["']/g, "").replace(/\./g, "").toLowerCase();
  }

  // Membersihkan key dari karakter terlarang Firebase (., #, $, /, [, ])
  function cleanKeys(obj) {
    const newObj = {};
    Object.keys(obj).forEach(key => {
      const cleanKey = key.replace(/[.#$/[\]]/g, '').replace(/\s\s+/g, ' ').trim();
      newObj[cleanKey] = obj[key];
    });
    return newObj;
  }

  function findKey(row, options) {
    const keys = Object.keys(row);
    for (let k of keys) {
      const nk = normalizeKey(k);
      for (let opt of options) {
        if (nk.includes(opt)) return k;
      }
    }
    return null;
  }

  function updateProgress() {
    showBatchStatus(`Batch progress: ${done}/${total} selesai, ${failed} gagal`, "info");
  }

  const monthMap = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
  };
  const monthNames = [ "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];

  files.forEach(file => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: header => header.trim(),
        complete: results => processBatchRecords(results.data, file.name),
        error: () => processFailed(file.name)
      });
    } else if (
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls")
    ) {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
          processBatchRecords(rows, file.name);
        } catch (err) {
          console.error("❌ XLSX read error:", err);
          processFailed(file.name);
        }
      };
      reader.onerror = (e) => {
        console.error("❌ FileReader error:", e);
        processFailed(file.name);
      };
      reader.readAsArrayBuffer(file);
    } else {
      console.warn("❌ File type not supported:", file.name);
      processFailed(file.name);
    }
  });

  function processBatchRecords(rows, fileName) {
    try {
      let promises = [];
      rows.forEach((row, idx) => {
        // Debug log row
        console.log(`[${fileName}] Row ${idx + 1}:`, row);

        // Temukan key untuk kolom tanggal dan nomor container
        const dateKey = findKey(row, ["date", "tanggal"]);
        const containerKey = findKey(row, ["containernumber", "containernomor"]);

        console.log(`[${fileName}] Row ${idx + 1} - Detected dateKey:`, dateKey, ", containerKey:", containerKey);

        const rawDate = dateKey ? row[dateKey] : "";
        const rawContainerNum = containerKey ? row[containerKey] : "";

        const dateStr = String(rawDate).trim();
        const containerNum = String(rawContainerNum).trim();

        if (!dateStr || !containerNum) {
          console.warn(`[${fileName}] Row ${idx + 1} - SKIPPED: date or containerNum missing`, {dateStr, containerNum});
          return;
        }

        const match = dateStr.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/);
        if (!match) {
          console.warn(`[${fileName}] Row ${idx + 1} - SKIPPED: date format not match`, dateStr);
          return;
        }
        const [_, d, m, y] = match;
        const day = parseInt(d, 10);
        const month = monthMap[m];
        const year = y.length === 2 ? "20" + y : y;

        if (!day || !month || !year) {
          console.warn(`[${fileName}] Row ${idx + 1} - SKIPPED: day/month/year not valid`, {day, month, year});
          return;
        }

        const monthName = monthNames[month];
        const path = `incomingSchedule/${year}/${monthName}/${day}/${containerNum}`;

        // Membersihkan key dari karakter terlarang sebelum upload
        const safeRow = cleanKeys(row);
        console.log(`[${fileName}] Row ${idx + 1} - Cleaned keys:`, safeRow);
        console.log(`[${fileName}] Row ${idx + 1} - Writing to:`, path, safeRow);

        const promise = db.ref(path).set(safeRow)
          .then(() => {
            console.log(`[${fileName}] Row ${idx + 1} - SUCCESS upload`);
          })
          .catch((err) => {
            console.error(`[${fileName}] Row ${idx + 1} - ERROR upload:`, err);
          });

        promises.push(promise);
      });

      Promise.all(promises)
        .then(() => {
          done++;
          updateProgress();
          checkComplete();
        })
        .catch((err) => {
          console.error(`[${fileName}] Batch upload error:`, err);
          processFailed(fileName);
        });
    } catch (err) {
      console.error(`[${fileName}] processBatchRecords fatal error:`, err);
      processFailed(fileName);
    }
  }

  function processFailed(fileName) {
    failed++;
    failedFiles.push(fileName);
    updateProgress();
    checkComplete();
  }

  function checkComplete() {
    if (done + failed === total) {
      if (failed === 0) {
        showBatchStatus("✅ Semua file berhasil diupload!", "success");
      } else {
        showBatchStatus(`⚠️ Ada ${failed} file gagal diupload: ${failedFiles.join(", ")}`, "error");
      }
      batchCsvInput.value = "";
      setTimeout(() => showBatchStatus("", ""), 4000);
    }
  }
}

csvInput.addEventListener("change", function (e) {
  selectedFile = e.target.files[0];
  showStatus("📁 File siap diupload. Klik tombol Upload.", "info");
});

uploadBtn.addEventListener("click", function () {
  if (!selectedFile) {
    showStatus("⚠️ Silakan pilih file CSV terlebih dahulu!", "error");
    return;
  }
  parseAndUploadCSV(selectedFile);
});

document.addEventListener("blur", function (e) {
  if (e.target.classList.contains("editable")) {
    const row = e.target.closest("tr");
    const recordId = row?.dataset?.id;
    if (!recordId) return;

    const timeIn = row.querySelector(".time-in").textContent.trim() || "-";
    const unloading = row.querySelector(".unloading-time").textContent.trim() || "-";
    const finish = row.querySelector(".finish").textContent.trim() || "-";

    const prevData = firebaseRecords[recordId] || {};
    const isChanged = (
      (prevData["TIME IN"] || "-") !== timeIn ||
      (prevData["UNLOADING TIME"] || "-") !== unloading ||
      (prevData["FINISH"] || "-") !== finish
    );

    if (isChanged) {
      updateFirebaseField(recordId, timeIn, unloading, finish);
    }
  }
}, true);

loadFirebaseData();