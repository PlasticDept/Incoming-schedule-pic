// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBYdbo6du0u3ZxT53lFEXpNccPwTu8czN4",
  authDomain: "incoming-schedule-monitoring.firebaseapp.com",
  projectId: "incoming-schedule-monitoring",
  storageBucket: "incoming-schedule-monitoring.firebasestorage.app",
  messagingSenderId: "460704037681",
  appId: "1:460704037681:web:311d272b7ca9250f130e10",
  databaseURL: "https://incoming-schedule-monitoring-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const table = $("#containerTable").DataTable();
const csvInput = document.getElementById("csvFile");
const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");
let selectedFile = null;
let firebaseRecords = {}; // mirip airtableRecords sebelumnya

function showStatus(message, type = "info") {
  uploadStatus.textContent = message;
  uploadStatus.className = `status ${type}`;
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
      <td>${row["INCOMING PLAN"] || ""}</td>
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
