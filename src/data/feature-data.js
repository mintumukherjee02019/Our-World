const featureData = {
  maintenance: [
    { id: "m1", month: "January 2026", amount: 40, status: "Pending", dueDate: "2026-02-20" },
    { id: "m2", month: "December 2025", amount: 40, status: "Paid", dueDate: "2026-01-10" },
  ],
  visitors: [
    { id: "v1", name: "Rahul Verma", purpose: "Delivery", time: "10:30 AM", status: "Checked In" },
    { id: "v2", name: "Anita Shah", purpose: "Personal", time: "1:15 PM", status: "Expected" },
  ],
  notices: [
    { id: "n1", title: "Water Shutdown", description: "2PM to 5PM due to maintenance.", date: "2026-02-16" },
    { id: "n2", title: "Lift Maintenance", description: "Tower B lift 2 unavailable from 11AM to 1PM.", date: "2026-02-17" },
  ],
  complaints: [
    { id: "c1", subject: "Street Light Issue", status: "In Progress", date: "2026-02-14" },
    { id: "c2", subject: "Basement Leakage", status: "Resolved", date: "2026-02-10" },
  ],
  updates: [
    { id: "u1", title: "Society Update", description: "Water supply will be off for maintenance from 2PM - 5PM today." },
    { id: "u2", title: "Community Event", description: "Republic Day celebration at clubhouse, 6PM." },
  ],
  stats: [
    { id: "s1", title: "Pending Dues", value: "$40" },
    { id: "s2", title: "Upcoming Events", value: "28" },
    { id: "s3", title: "Visitor Today", value: "1-3" },
    { id: "s4", title: "Poll Active", value: "19" },
  ],
};

module.exports = featureData;

