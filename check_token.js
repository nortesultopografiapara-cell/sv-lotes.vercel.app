fetch("https://aezktedncttwpqeunjej.supabase.co/auth/v1/token?grant_type=password", {
  method: 'POST',
  headers: {
    "apikey": "sb_publishable_Gqpvj7323UareRnjBlAPxQ_L_ZkHqQ8",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ email: "test@domain.com", password: "password" })
})
  .then(res => {
    console.log("STATUS:", res.status);
    return res.text();
  })
  .then(text => console.log("BODY:", text))
  .catch(err => console.error("ERROR:", err));
