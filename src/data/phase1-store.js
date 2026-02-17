const nowIso = () => new Date().toISOString();

const defaultPhase1Store = {
  notices: [
    {
      id: "n_1",
      title: "Water Supply Maintenance",
      category: "Maintenance",
      priority: "High",
      content: "Water supply will be off from 2PM to 5PM due to pipeline maintenance.",
      postedBy: "Rajesh Sharma",
      createdAt: "2026-02-16T09:00:00.000Z",
      pinned: true,
      attachments: [],
      readBy: [],
    },
    {
      id: "n_2",
      title: "Diwali Celebration",
      category: "Events",
      priority: "Normal",
      content: "Join celebration at clubhouse from 7PM this Saturday.",
      postedBy: "Neha Patel",
      createdAt: "2026-02-15T14:00:00.000Z",
      pinned: false,
      attachments: [],
      readBy: [],
    },
  ],
  payments: [
    {
      id: "p_1",
      type: "Maintenance",
      amount: 3500,
      month: "2026-02",
      status: "Pending",
      paidAt: null,
      transactionRef: null,
    },
    {
      id: "p_2",
      type: "Maintenance",
      amount: 3500,
      month: "2026-01",
      status: "Paid",
      paidAt: "2026-01-05T08:00:00.000Z",
      transactionRef: "TXN-OW-10021",
    },
  ],
  complaints: [
    {
      id: "c_1",
      title: "Electrical",
      category: "Electrical",
      details: "Hallway light is not working on floor 2.",
      status: "Open",
      assignedTo: "Maintenance Team",
      createdAt: "2026-02-14T07:30:00.000Z",
      comments: [
        {
          id: "cc_1",
          by: "Resident",
          message: "Please fix this by tonight.",
          createdAt: "2026-02-14T08:00:00.000Z",
        },
      ],
    },
    {
      id: "c_2",
      title: "Low Water Pressure",
      category: "Plumbing",
      details: "Pressure is too low in bathroom line.",
      status: "In Progress",
      assignedTo: "Vendor Team",
      createdAt: "2026-02-13T10:00:00.000Z",
      comments: [],
    },
  ],
  polls: [
    {
      id: "poll_1",
      question: "Should we upgrade gym equipment this quarter?",
      options: [
        { id: "opt_1", label: "Yes", votes: 19 },
        { id: "opt_2", label: "No", votes: 4 },
      ],
      active: true,
      votedUserIds: [],
    },
  ],
  events: [
    {
      id: "e_1",
      title: "Society Townhall",
      date: "2026-02-28",
      time: "6:00 PM",
      venue: "Community Hall",
      description: "Monthly society discussion and updates.",
      rsvpCount: 23,
      userRsvp: false,
    },
  ],
  amenityBookings: [
    {
      id: "b_1",
      amenity: "Clubhouse",
      date: "2026-03-02",
      slot: "7:00 PM - 9:00 PM",
      status: "Approved",
      requestedBy: "u_1001",
    },
  ],
  documents: [
    {
      id: "d_1",
      title: "Society Bye-laws",
      category: "General",
      fileType: "pdf",
      url: "/files/bye-laws.pdf",
      uploadedAt: "2026-01-10T00:00:00.000Z",
    },
    {
      id: "d_2",
      title: "Vendor Contacts",
      category: "Vendors",
      fileType: "pdf",
      url: "/files/vendor-contacts.pdf",
      uploadedAt: "2026-01-20T00:00:00.000Z",
    },
  ],
  chats: {
    users: [
      { id: "u_1001", name: "Abhishek", phone: "9876543210", online: true },
      { id: "u_1002", name: "Ritu Sharma", phone: "9670943210", online: true },
      { id: "u_1003", name: "Rohit Plumber", phone: "9765432101", online: false },
    ],
    threads: [
      {
        id: "t_1",
        type: "direct",
        name: "Ritu Sharma",
        members: ["u_1001", "u_1002"],
        messages: [
          {
            id: "m_1",
            by: "u_1002",
            text: "Hi Abhishek, can you share plumber contact?",
            createdAt: "2026-02-16T09:10:00.000Z",
          },
          {
            id: "m_2",
            by: "u_1001",
            text: "Sure, sharing now.",
            createdAt: "2026-02-16T09:11:00.000Z",
          },
        ],
      },
    ],
  },
  profile: {
    id: "u_1001",
    name: "Abhishek",
    flat: "Tower B, 1204",
    phone: "9876543210",
    email: "abhishek@example.com",
    familyMembers: [{ id: "fm_1", name: "Asha", relation: "Spouse", phone: "9898989898" }],
  },
  featureRequests: [
    {
      id: "fr_1",
      title: "Add QR visitor pass sharing",
      description: "Need quick QR share for expected visitors.",
      status: "In Review",
      attachmentUrl: null,
      createdAt: "2026-02-10T11:00:00.000Z",
    },
  ],
};

let liveStore = JSON.parse(JSON.stringify(defaultPhase1Store));

const setLiveStore = (newStore) => {
  liveStore = newStore;
};

const getLiveStore = () => liveStore;

const createId = (prefix) => `${prefix}_${Math.floor(Math.random() * 1e7)}`;

const withMeta = (item) => ({ ...item, updatedAt: nowIso() });

module.exports = {
  defaultPhase1Store,
  getLiveStore,
  setLiveStore,
  createId,
  nowIso,
  withMeta,
};

