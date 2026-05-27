// ─── CCRM Mock Data ───────────────────────────────────────────────────────────

export const LEADS = [
  { id: 1,  name: 'Ravi Kumar Sharma',        email: 'ravi.sharma@gmail.com',       mobile: '9876543210', state: 'Andhra Pradesh', city: 'Visakhapatnam', regDate: '26/05/2026, 12:42 PM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Facebook Ads',  owner: 'Vikram K.',   score: 82 },
  { id: 2,  name: 'Priya Devi Nayak',         email: 'priya.nayak@yahoo.com',       mobile: '9845123456', state: 'Odisha',         city: 'Bhubaneswar',  regDate: '26/05/2026, 12:14 PM', stage: 'Untouched',         stageColor: 'red',    source: 'Walk-in',       owner: 'Anita S.',    score: 0  },
  { id: 3,  name: 'Arjun Patel',              email: 'arjun.patel@gmail.com',       mobile: '9765432109', state: 'Andhra Pradesh', city: 'Guntur',       regDate: '26/05/2026, 12:11 PM', stage: 'Unqualified Leads', stageColor: 'orange', source: 'LinkedIn',      owner: 'Rahul V.',    score: 35 },
  { id: 4,  name: 'Sneha Reddy',              email: 'sneha.reddy@outlook.com',     mobile: '9654321098', state: 'Telangana',      city: 'Hyderabad',    regDate: '26/05/2026, 11:22 AM', stage: 'Untouched',         stageColor: 'red',    source: 'Google Ads',    owner: 'Meena P.',    score: 0  },
  { id: 5,  name: 'Kiran Babu Rao',           email: 'kiran.rao@gmail.com',         mobile: '9543210987', state: 'Odisha',         city: 'Cuttack',      regDate: '26/05/2026, 10:33 AM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Referral',      owner: 'Vikram K.',   score: 74 },
  { id: 6,  name: 'Ananya Mishra',            email: 'ananya.mishra@gmail.com',     mobile: '9432109876', state: 'Odisha',         city: 'Rourkela',     regDate: '26/05/2026, 10:19 AM', stage: 'Untouched',         stageColor: 'red',    source: 'Website',       owner: 'Suresh D.',   score: 0  },
  { id: 7,  name: 'Suresh Chandra Das',       email: 'suresh.das@rediffmail.com',   mobile: '9321098765', state: 'Andhra Pradesh', city: 'Vijayawada',   regDate: '26/05/2026, 09:45 AM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Education Fair',owner: 'Kavitha R.',  score: 68 },
  { id: 8,  name: 'Deepika Mohapatra',        email: 'deepika.m@gmail.com',         mobile: '9210987654', state: 'Odisha',         city: 'Berhampur',    regDate: '25/05/2026, 04:12 PM', stage: 'Unqualified Leads', stageColor: 'orange', source: 'Facebook Ads',  owner: 'Deepak M.',   score: 28 },
  { id: 9,  name: 'Rajesh Kumar Sahu',        email: 'rajesh.sahu@gmail.com',       mobile: '9109876543', state: 'Odisha',         city: 'Sambalpur',    regDate: '25/05/2026, 03:30 PM', stage: 'Untouched',         stageColor: 'red',    source: 'SMS Campaign',  owner: 'Preethi N.',  score: 0  },
  { id: 10, name: 'Lakshmi Priya',            email: 'lakshmi.priya@gmail.com',     mobile: '9098765432', state: 'Andhra Pradesh', city: 'Nellore',      regDate: '25/05/2026, 02:55 PM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Referral',      owner: 'Arun K.',     score: 91 },
  { id: 11, name: 'Venkat Narayana',          email: 'venkat.n@gmail.com',          mobile: '8987654321', state: 'Andhra Pradesh', city: 'Kurnool',      regDate: '25/05/2026, 01:20 PM', stage: 'Untouched',         stageColor: 'red',    source: 'Google Ads',    owner: 'Sunita B.',   score: 0  },
  { id: 12, name: 'Sushma Rani Behera',       email: 'sushma.behera@gmail.com',     mobile: '8876543210', state: 'Odisha',         city: 'Puri',         regDate: '25/05/2026, 12:10 PM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Walk-in',       owner: 'Vikram K.',   score: 77 },
  { id: 13, name: 'Manoj Kumar Tripathy',     email: 'manoj.tripathy@gmail.com',    mobile: '8765432109', state: 'Odisha',         city: 'Balasore',     regDate: '25/05/2026, 11:05 AM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'LinkedIn',      owner: 'Anita S.',    score: 65 },
  { id: 14, name: 'Pooja Agarwal',            email: 'pooja.agarwal@gmail.com',     mobile: '8654321098', state: 'West Bengal',    city: 'Kolkata',      regDate: '25/05/2026, 10:00 AM', stage: 'Untouched',         stageColor: 'red',    source: 'Facebook Ads',  owner: 'Rahul V.',    score: 0  },
  { id: 15, name: 'Santosh Kumar Jena',       email: 'santosh.jena@gmail.com',      mobile: '8543210987', state: 'Odisha',         city: 'Kendrapara',   regDate: '25/05/2026, 09:15 AM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Referral',      owner: 'Meena P.',    score: 58 },
  { id: 16, name: 'T. Varun Kumar',           email: 'varun.thummaganti@gmail.com', mobile: '9390691445', state: 'Andhra Pradesh', city: 'Vizianagaram', regDate: '26/05/2026, 12:05 PM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Google Ads',    owner: 'Kavitha R.',  score: 80 },
  { id: 17, name: 'Bhavitha Sree',            email: 'bhavithasree99@gmail.com',    mobile: '9989654246', state: 'Andhra Pradesh', city: 'Tadepalligudem',regDate:'26/05/2026, 11:22 AM', stage: 'Untouched',         stageColor: 'red',    source: 'Website',       owner: 'Deepak M.',   score: 0  },
  { id: 18, name: 'Parchuri Venkata Thanuja', email: 'thanujaparchuri3@gmail.com',  mobile: '7382449004', state: 'Andhra Pradesh', city: 'Ongole',       regDate: '26/05/2026, 10:33 AM', stage: 'Qualified Leads',   stageColor: 'green',  source: 'Referral',      owner: 'Preethi N.',  score: 72 },
  { id: 19, name: 'Karrotu Durga Prasad',     email: 'karthikcherry206@gmail.com',  mobile: '8125047286', state: 'Andhra Pradesh', city: 'Vizianagaram', regDate: '26/05/2026, 09:35 AM', stage: 'Unqualified Leads', stageColor: 'orange', source: 'Facebook Ads',  owner: 'Arun K.',     score: 42 },
  { id: 20, name: 'Kumar Kotturu',            email: 'kotturukumar73@gmail.com',    mobile: '7995232246', state: 'Andhra Pradesh', city: 'Visakhapatnam', regDate:'25/05/2026, 03:45 PM', stage: 'Untouched',         stageColor: 'red',    source: 'SMS Campaign',  owner: 'Sunita B.',   score: 0  },
]

export const APPLICATIONS = [
  { id: 1,  name: 'Korumalli Vandana',        appNo: 'CUEE202612229', email: 'vandanasai063@gmail.com',   mobile: '9133033136', formStatus: 'Incomplete', payStatus: 'Payment Pending',  payMethod: '',       campus: 'Paralakhemundi', course: 'M.Sc Agriculture (Genetics)', stage: 'Application Started' },
  { id: 2,  name: 'Relli Poornima',           appNo: 'CUEEMA262127',  email: 'poornima@Gmail.com',        mobile: '9603317965', formStatus: 'Incomplete', payStatus: 'Payment Pending',  payMethod: '',       campus: 'Bhubaneswar',    course: 'MBA',                         stage: 'Verified'            },
  { id: 3,  name: 'Parchuri Venkata Thanuja', appNo: 'CUEEMA262109',  email: 'thanujaparchuri3@gmail.com',mobile: '7382449004', formStatus: 'Complete',   payStatus: 'Payment Pending',  payMethod: '',       campus: 'Vizianagaram',   course: 'B.Tech CSE',                  stage: 'Application Started' },
  { id: 4,  name: 'Karrotu Durga Prasad',     appNo: 'CUEEMA262106',  email: 'karthikcherry206@gmail.com',mobile: '8125047286', formStatus: 'Incomplete', payStatus: 'Payment Pending',  payMethod: '',       campus: 'Bhubaneswar',    course: 'B.Tech ECE',                  stage: 'Verified'            },
  { id: 5,  name: 'Kumar Kotturu',            appNo: 'CUEE20266235',  email: 'kotturukumar73@gmail.com',  mobile: '7995232246', formStatus: 'Incomplete', payStatus: 'Payment Pending',  payMethod: '',       campus: 'Paralakhemundi', course: 'BCA',                         stage: 'Unverified'          },
  { id: 6,  name: 'Karla Rajesh',             appNo: 'CUEE20266611',  email: 'karlarajesh88@gmail.com',   mobile: '7093030264', formStatus: 'Complete',   payStatus: 'Payment Pending',  payMethod: 'Online', campus: 'Bhubaneswar',    course: 'B.Com',                       stage: 'Payment Approved'    },
  { id: 7,  name: 'K. Sudhamani',             appNo: 'CUEE20269810',  email: 'jsudhamani123@gmail.com',   mobile: '6303911866', formStatus: 'Incomplete', payStatus: 'Payment Pending',  payMethod: '',       campus: 'Vizianagaram',   course: 'M.Tech',                      stage: 'Application Started' },
  { id: 8,  name: 'Sowjanya Kolli',           appNo: 'CUEE202639',    email: 'kollikumari254@gmail.com',  mobile: '9441007820', formStatus: 'Complete',   payStatus: 'Payment Approved', payMethod: 'Offline',campus: 'Bhubaneswar',    course: 'MBA',                         stage: 'Application Submitted'},
  { id: 9,  name: 'Ravi Kumar Sharma',        appNo: 'CUEE20261001',  email: 'ravi.sharma@gmail.com',     mobile: '9876543210', formStatus: 'Complete',   payStatus: 'Payment Approved', payMethod: 'Online', campus: 'Bhubaneswar',    course: 'B.Tech CSE',                  stage: 'Enrolments'          },
  { id: 10, name: 'Priya Devi Nayak',         appNo: 'CUEE20261002',  email: 'priya.nayak@yahoo.com',     mobile: '9845123456', formStatus: 'Incomplete', payStatus: 'Payment Pending',  payMethod: '',       campus: 'Paralakhemundi', course: 'BBA',                         stage: 'Unverified'          },
]

export const COUNSELORS = [
  { name: 'Vikram K.',   email: 'vkumar@cutm.ac.in',      leads: 555,  apps: 65,  engaged: 208, untouched: 135, payApproved: 8,  submitted: 7,  enrolled: 7  },
  { name: 'Anita S.',    email: 'anitas@cutm.ac.in',       leads: 622,  apps: 197, engaged: 312, untouched: 89,  payApproved: 22, submitted: 15, enrolled: 12 },
  { name: 'Rahul V.',    email: 'rahulv@cutm.ac.in',       leads: 557,  apps: 112, engaged: 280, untouched: 142, payApproved: 14, submitted: 9,  enrolled: 5  },
  { name: 'Meena P.',    email: 'meenap@cutm.ac.in',       leads: 579,  apps: 77,  engaged: 290, untouched: 178, payApproved: 9,  submitted: 6,  enrolled: 3  },
  { name: 'Suresh D.',   email: 'sureshd@cutm.ac.in',      leads: 1034, apps: 325, engaged: 520, untouched: 0,   payApproved: 38, submitted: 28, enrolled: 18 },
  { name: 'Kavitha R.',  email: 'kavithar@cutm.ac.in',     leads: 3577, apps: 62,  engaged: 1800,untouched: 221, payApproved: 7,  submitted: 4,  enrolled: 2  },
  { name: 'Deepak M.',   email: 'deepakm@cutm.ac.in',      leads: 5,    apps: 3,   engaged: 4,   untouched: 1,   payApproved: 0,  submitted: 0,  enrolled: 0  },
  { name: 'Preethi N.',  email: 'preethin@cutm.ac.in',     leads: 1361, apps: 11,  engaged: 441, untouched: 65,  payApproved: 1,  submitted: 1,  enrolled: 0  },
  { name: 'Arun K.',     email: 'arunk@cutm.ac.in',        leads: 1925, apps: 276, engaged: 551, untouched: 1,   payApproved: 29, submitted: 8,  enrolled: 20 },
  { name: 'Sunita B.',   email: 'sunitab@cutm.ac.in',      leads: 747,  apps: 69,  engaged: 355, untouched: 0,   payApproved: 4,  submitted: 3,  enrolled: 0  },
]

export const CAMPAIGNS = [
  { id: 1, name: 'CUEE 2026 Facebook Campaign', channel: 'Facebook Ads', status: 'Active',   budget: 150000, spent: 98000,  leads: 1240, conversions: 87,  startDate: '01/04/2026', endDate: '30/06/2026' },
  { id: 2, name: 'Google Search – B.Tech',      channel: 'Google Ads',   status: 'Active',   budget: 200000, spent: 145000, leads: 2100, conversions: 156, startDate: '15/03/2026', endDate: '15/07/2026' },
  { id: 3, name: 'LinkedIn MBA Campaign',        channel: 'LinkedIn',     status: 'Paused',   budget: 80000,  spent: 62000,  leads: 430,  conversions: 42,  startDate: '01/04/2026', endDate: '31/05/2026' },
  { id: 4, name: 'WhatsApp Drip – Agriculture',  channel: 'WhatsApp',     status: 'Active',   budget: 30000,  spent: 18000,  leads: 680,  conversions: 95,  startDate: '10/04/2026', endDate: '10/07/2026' },
  { id: 5, name: 'Education Fair – Vizag',       channel: 'Offline',      status: 'Completed',budget: 50000,  spent: 48500,  leads: 320,  conversions: 38,  startDate: '20/03/2026', endDate: '22/03/2026' },
  { id: 6, name: 'SMS Blast – Odisha',           channel: 'SMS',          status: 'Active',   budget: 25000,  spent: 12000,  leads: 890,  conversions: 67,  startDate: '01/05/2026', endDate: '31/05/2026' },
]

export const TASKS = [
  { id: 1,  title: 'Follow up with Ravi Kumar',       type: 'Call',     priority: 'High',   due: '27/05/2026 10:00 AM', status: 'Pending',   assignee: 'Vikram K.',  lead: 'Ravi Kumar Sharma'    },
  { id: 2,  title: 'Send brochure to Priya Nayak',    type: 'Email',    priority: 'Medium', due: '27/05/2026 11:30 AM', status: 'Pending',   assignee: 'Anita S.',   lead: 'Priya Devi Nayak'     },
  { id: 3,  title: 'Schedule campus visit – Arjun',   type: 'Meeting',  priority: 'High',   due: '27/05/2026 02:00 PM', status: 'Completed', assignee: 'Rahul V.',   lead: 'Arjun Patel'          },
  { id: 4,  title: 'Payment reminder – Sneha Reddy',  type: 'WhatsApp', priority: 'High',   due: '27/05/2026 03:00 PM', status: 'Pending',   assignee: 'Meena P.',   lead: 'Sneha Reddy'          },
  { id: 5,  title: 'Document collection – Kiran',     type: 'Task',     priority: 'Low',    due: '28/05/2026 09:00 AM', status: 'Pending',   assignee: 'Vikram K.',  lead: 'Kiran Babu Rao'       },
  { id: 6,  title: 'GD/PI scheduling – Ananya',       type: 'Meeting',  priority: 'Medium', due: '28/05/2026 11:00 AM', status: 'Pending',   assignee: 'Suresh D.',  lead: 'Ananya Mishra'        },
  { id: 7,  title: 'Verify documents – Suresh Das',   type: 'Task',     priority: 'High',   due: '28/05/2026 02:30 PM', status: 'Pending',   assignee: 'Kavitha R.', lead: 'Suresh Chandra Das'   },
  { id: 8,  title: 'Send offer letter – Deepika',     type: 'Email',    priority: 'Medium', due: '29/05/2026 10:00 AM', status: 'Pending',   assignee: 'Deepak M.',  lead: 'Deepika Mohapatra'    },
]

export const PAYMENTS = [
  { id: 1,  name: 'Sowjanya Kolli',           appNo: 'CUEE202639',   amount: 25000, method: 'Offline', status: 'Approved',  date: '26/05/2026', txnId: 'TXN001234' },
  { id: 2,  name: 'Karla Rajesh',             appNo: 'CUEE20266611', amount: 25000, method: 'Online',  status: 'Approved',  date: '25/05/2026', txnId: 'TXN001235' },
  { id: 3,  name: 'Ravi Kumar Sharma',        appNo: 'CUEE20261001', amount: 50000, method: 'Online',  status: 'Approved',  date: '24/05/2026', txnId: 'TXN001236' },
  { id: 4,  name: 'Korumalli Vandana',        appNo: 'CUEE202612229',amount: 25000, method: '',        status: 'Pending',   date: '',           txnId: ''          },
  { id: 5,  name: 'Relli Poornima',           appNo: 'CUEEMA262127', amount: 25000, method: '',        status: 'Pending',   date: '',           txnId: ''          },
  { id: 6,  name: 'Parchuri Venkata Thanuja', appNo: 'CUEEMA262109', amount: 50000, method: '',        status: 'Pending',   date: '',           txnId: ''          },
  { id: 7,  name: 'Karrotu Durga Prasad',     appNo: 'CUEEMA262106', amount: 50000, method: '',        status: 'Pending',   date: '',           txnId: ''          },
  { id: 8,  name: 'Kumar Kotturu',            appNo: 'CUEE20266235', amount: 25000, method: '',        status: 'Failed',    date: '23/05/2026', txnId: 'TXN001237' },
]

export const QUERIES = [
  { id: 1,  student: 'Ravi Kumar Sharma',   subject: 'Admission process for B.Tech CSE',    category: 'Admission',  priority: 'High',   status: 'Open',     assignee: 'Vikram K.',  created: '26/05/2026' },
  { id: 2,  student: 'Priya Devi Nayak',    subject: 'Fee structure for MBA program',        category: 'Finance',    priority: 'Medium', status: 'Resolved', assignee: 'Anita S.',   created: '25/05/2026' },
  { id: 3,  student: 'Arjun Patel',         subject: 'Hostel availability at Bhubaneswar',   category: 'Hostel',     priority: 'Low',    status: 'Open',     assignee: 'Rahul V.',   created: '25/05/2026' },
  { id: 4,  student: 'Sneha Reddy',         subject: 'Scholarship eligibility criteria',     category: 'Scholarship',priority: 'High',   status: 'In Progress',assignee:'Meena P.',  created: '24/05/2026' },
  { id: 5,  student: 'Kiran Babu Rao',      subject: 'Document submission deadline',         category: 'Admission',  priority: 'High',   status: 'Open',     assignee: 'Vikram K.',  created: '24/05/2026' },
  { id: 6,  student: 'Ananya Mishra',       subject: 'Course curriculum for M.Tech',         category: 'Academic',   priority: 'Low',    status: 'Resolved', assignee: 'Suresh D.',  created: '23/05/2026' },
]

export const DOCUMENTS = [
  { id: 1,  student: 'Ravi Kumar Sharma',   type: '10th Marksheet',    status: 'Verified',  uploadDate: '20/05/2026' },
  { id: 2,  student: 'Ravi Kumar Sharma',   type: '12th Marksheet',    status: 'Verified',  uploadDate: '20/05/2026' },
  { id: 3,  student: 'Ravi Kumar Sharma',   type: 'Aadhaar Card',      status: 'Verified',  uploadDate: '21/05/2026' },
  { id: 4,  student: 'Priya Devi Nayak',    type: '10th Marksheet',    status: 'Pending',   uploadDate: '22/05/2026' },
  { id: 5,  student: 'Priya Devi Nayak',    type: 'Transfer Certificate',status:'Rejected', uploadDate: '22/05/2026' },
  { id: 6,  student: 'Arjun Patel',         type: '10th Marksheet',    status: 'Verified',  uploadDate: '23/05/2026' },
  { id: 7,  student: 'Arjun Patel',         type: '12th Marksheet',    status: 'Pending',   uploadDate: '23/05/2026' },
]

export const EVENTS = [
  { id: 1, title: 'GD Session – Batch A',     date: '2026-05-28', time: '10:00 AM', type: 'GD',       venue: 'Room 101, Main Campus', participants: 12 },
  { id: 2, title: 'PI – MBA Candidates',       date: '2026-05-28', time: '02:00 PM', type: 'PI',       venue: 'Conference Hall',       participants: 8  },
  { id: 3, title: 'WAT – B.Tech Batch',        date: '2026-05-29', time: '09:00 AM', type: 'WAT',      venue: 'Exam Hall 2',           participants: 25 },
  { id: 4, title: 'Campus Tour – Vizag',       date: '2026-05-30', time: '11:00 AM', type: 'Tour',     venue: 'Vizag Campus',          participants: 15 },
  { id: 5, title: 'Orientation – New Batch',   date: '2026-06-01', time: '09:00 AM', type: 'Orientation',venue:'Auditorium',           participants: 120},
]

export const USERS = [
  { id: 1, name: 'Vikram Kumar',    email: 'vkumar@cutm.ac.in',   password: 'Admin@123',      role: 'Admin',     team: 'Management',  status: 'Active',   lastLogin: '27/05/2026 09:15 AM' },
  { id: 2, name: 'Anita Sharma',    email: 'anitas@cutm.ac.in',   password: 'Manager@123',    role: 'Manager',   team: 'Admissions',  status: 'Active',   lastLogin: '27/05/2026 08:45 AM' },
  { id: 3, name: 'Rahul Verma',     email: 'rahulv@cutm.ac.in',   password: 'Counselor@123',  role: 'Counselor', team: 'Sales',       status: 'Active',   lastLogin: '26/05/2026 06:30 PM' },
  { id: 4, name: 'Meena Patel',     email: 'meenap@cutm.ac.in',   password: 'Counselor@123',  role: 'Counselor', team: 'Sales',       status: 'Active',   lastLogin: '26/05/2026 05:00 PM' },
  { id: 5, name: 'Suresh Dubey',    email: 'sureshd@cutm.ac.in',  password: 'Counselor@123',  role: 'Counselor', team: 'Admissions',  status: 'Active',   lastLogin: '27/05/2026 09:00 AM' },
  { id: 6, name: 'Kavitha Rao',     email: 'kavithar@cutm.ac.in', password: 'Counselor@123',  role: 'Counselor', team: 'Marketing',   status: 'Active',   lastLogin: '26/05/2026 04:30 PM' },
  { id: 7, name: 'Deepak Mishra',   email: 'deepakm@cutm.ac.in',  password: 'Counselor@123',  role: 'Counselor', team: 'Sales',       status: 'Inactive', lastLogin: '20/05/2026 11:00 AM' },
  { id: 8, name: 'Preethi Nair',    email: 'preethin@cutm.ac.in', password: 'Counselor@123',  role: 'Counselor', team: 'Admissions',  status: 'Active',   lastLogin: '27/05/2026 08:00 AM' },
]
