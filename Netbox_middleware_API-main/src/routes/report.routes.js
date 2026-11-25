const express = require("express");

const router_report = express.Router();

const {
  getReport,
  getReportAccessByHour,
  getAccessDistribution,
  getReportAccessByDay,
  getReportTotalEvent,
  getPartitionUsageAccess,
  exportPdf,
  getReportDayPartition,
  getReportHourPartition,
  getReadersByPartition,
  buildFilters,

  getPartitionUsageEvent,
  getReportEventType,
  getReportEventDay,
  getReportEventHour,
} = require("../controllers/report.controller.js");

router_report.get("/report/pdf", exportPdf);
router_report.get("/report", getReport);
router_report.get("/report/by-hour", getReportAccessByHour);
router_report.get("/report/accessDistribution", getAccessDistribution);
router_report.get("/report/by-day", getReportAccessByDay);
router_report.get("/report/total-event", getReportTotalEvent);
router_report.get("/report/partitions/access", getPartitionUsageAccess);
router_report.get("/report/dayPartition/access", getReportDayPartition);
router_report.get("/report/hourPartition/access", getReportHourPartition);
router_report.get("/report/partitions/event", getPartitionUsageEvent);
router_report.get("/report/dayPartition/event", getReportEventDay);
router_report.get("/report/hourPartition/event", getReportEventHour);
router_report.get("/report/readers", getReadersByPartition);
router_report.get("/report/eventType", getReportEventType);
module.exports = router_report;
