import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

/** Enroll an employee with photos */
export async function enrollEmployee(data, photos) {
  const form = new FormData();
  form.append("name", data.name);
  form.append("employee_id", data.employee_id);
  form.append("department", data.department || "");
  form.append("designation", data.designation || "");
  photos.forEach((file) => form.append("photos", file));
  const res = await api.post("/employees/enroll", form);
  return res.data;
}

/** Detect / identify faces in an image */
export async function detectFaces(imageFile) {
  const form = new FormData();
  form.append("image", imageFile);
  const res = await api.post("/detect", form);
  return res.data;
}

/** List all enrolled employees */
export async function listEmployees() {
  const res = await api.get("/employees");
  return res.data;
}

/** Get single employee */
export async function getEmployee(id) {
  const res = await api.get(`/employees/${id}`);
  return res.data;
}

/** Delete an employee */
export async function deleteEmployee(id) {
  const res = await api.delete(`/employees/${id}`);
  return res.data;
}

/** Live detect + auto check-in (from camera frame) */
export async function liveDetect(blob) {
  const form = new FormData();
  form.append("image", blob, "frame.jpg");
  const res = await api.post("/live-detect", form);
  return res.data;
}

/** Get today's check-ins */
export async function getTodayCheckins() {
  const res = await api.get("/checkins/today");
  return res.data;
}

/** Get attendance summary for today */
export async function getAttendanceToday() {
  const res = await api.get("/attendance/today");
  return res.data;
}

/** Get attendance summary for a specific date */
export async function getAttendanceByDate(dateStr) {
  const res = await api.get(`/attendance/${dateStr}`);
  return res.data;
}

/** Get weekly attendance summary */
export async function getWeeklySummary() {
  const res = await api.get("/attendance-weekly");
  return res.data;
}

/** eSSL — sync device */
export async function esslSync() {
  const res = await api.post("/essl/sync");
  return res.data;
}

/** eSSL — get status */
export async function esslStatus() {
  const res = await api.get("/essl/status");
  return res.data;
}

/** eSSL — get users */
export async function esslUsers() {
  const res = await api.get("/essl/users");
  return res.data;
}

