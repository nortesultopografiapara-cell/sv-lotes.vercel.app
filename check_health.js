fetch("https://aezktedncttwpqeunjej.supabase.co/auth/v1/health", {
  headers: {
    "apikey": "sb_publishable_Gqpvj7323UareRnjBlAPxQ_L_ZkHqQ8"
  }
})
  .then(res => {
    console.log("STATUS:", res.status);
    return res.text();
  })
  .then(text => console.log("BODY:", text))
  .catch(err => console.error("ERROR:", err));
