const dashboardPayload = {
  header: {
    societyName: "Skyline Apartments",
    address: "Tower B, Flat 1204",
    greeting: "Good Evening",
    residentName: "Abhishek",
  },
  features: [
    { id: "maintenance", title: "Pay Maintenance", tag: null, color: "pink" },
    { id: "visitors", title: "Visitors", tag: "New", color: "lavender" },
    { id: "notices", title: "Notices", tag: "New*", color: "rose" },
    { id: "complaints", title: "Complaints", tag: "New", color: "mint" },
    { id: "marketplace", title: "Marketplace", tag: "New", color: "peach" },
    { id: "nearby-deals", title: "Nearby Deals", tag: "Hot", color: "sky" },
  ],
  societyUpdate: {
    title: "Society Update",
    description: "Water supply will be off for maintenance from 2PM - 5PM today.",
  },
  quickStats: [
    { id: "dues", title: "Pending Dues", value: "$40", tag: "Now" },
    { id: "events", title: "Upcoming", value: "28", tag: "New" },
    { id: "visitorToday", title: "Visitor Today", value: "1", subValue: "3", tag: "New" },
    { id: "poll", title: "Poll Active", value: "19", tag: "New" },
  ],
};

module.exports = dashboardPayload;
