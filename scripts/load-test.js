import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  // Simulate 50 concurrent users constantly submitting jobs over 1 minute
  stages: [
    { duration: '10s', target: 10 }, // Ramp up to 10 users
    { duration: '30s', target: 50 }, // Ramp up to 50 users
    { duration: '20s', target: 0 },  // Ramp down to 0
  ],
};

// Assuming the local server is running on port 3000
const BASE_URL = 'http://localhost:3000/api/v1';

export default function () {
  const payload = JSON.stringify({
    videoUrl: 'https://youtube.com/watch?v=load_test_viral',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      // Mocking authorization for load testing purposes
      'Authorization': 'Bearer mock_load_test_token', 
    },
  };

  const res = http.post(`${BASE_URL}/jobs`, payload, params);

  check(res, {
    'status is 202': (r) => r.status === 202,
    'job enqueued': (r) => JSON.parse(r.body).data.status === 'QUEUED',
  });

  // Simulate user looking at dashboard before submitting another
  sleep(1);
}
