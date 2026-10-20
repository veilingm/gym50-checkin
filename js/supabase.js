(function () {
  'use strict';

  const SUPABASE_URL = 'https://xznoyrycjjtthobphfuy.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6bm95cnljamp0dGhvYnBoZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MDE1NjksImV4cCI6MjEwODA3NzU2OX0.H9ZSoTeP23tSvdCN1VY0mOBP-JTfE78hhPsFyi5jHxM';

  const client = (typeof supabase !== 'undefined' && supabase.createClient)
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

  let currentUser = null;

  function init() { return client; }
  function getUser() { return currentUser; }
  function isLoggedIn() { return !!currentUser; }

  async function signUp(email, password) {
    if (!client) throw new Error('客户端未加载');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) return { needsConfirmation: true };
    currentUser = data.user;
    return { needsConfirmation: false };
  }

  async function signIn(email, password) {
    if (!client) throw new Error('客户端未加载');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    return data;
  }

  async function signOut() {
    currentUser = null;
    if (!client) return;
    try { await client.auth.signOut(); } catch (e) { /* ignore */ }
  }

  async function restoreSession() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    currentUser = data.session ? data.session.user : null;
    return currentUser;
  }

  // ---- data ------------------------------------------------------------------
  async function fetchSessions() {
    if (!client) return [];
    const { data, error } = await client
      .from('sessions')
      .select('id, date, minutes')
      .order('date', { ascending: true });
    if (error) throw error;
    return (data || []).map((s) => ({ id: s.id, date: s.date, minutes: s.minutes }));
  }

  async function fetchSettings() {
    if (!client) return null;
    const { data, error } = await client
      .from('user_settings')
      .select('start_date, target, goal_min')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { start: data.start_date, target: data.target, goalMin: data.goal_min };
  }

  async function pushSessions(sessions) {
    if (!client) return;
    const payload = sessions.map((s) => ({ id: s.id, date: s.date, minutes: s.minutes }));
    const { error } = await client.rpc('replace_sessions', { p_sessions: payload });
    if (error) throw error;
  }

  async function pushSettings(settings) {
    if (!client) return;
    const { error } = await client.from('user_settings').upsert({
      user_id: currentUser.id,
      start_date: settings.start,
      target: settings.target,
      goal_min: settings.goalMin,
    });
    if (error) throw error;
  }

  window.Supabase = {
    init, getUser, isLoggedIn,
    signUp, signIn, signOut, restoreSession,
    fetchSessions, fetchSettings, pushSessions, pushSettings,
  };
})();
