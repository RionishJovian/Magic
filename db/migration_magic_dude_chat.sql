-- Magic Dude Chat Tables for Supabase
-- Stores conversation threads, messages, and enforces daily message cap

CREATE TABLE IF NOT EXISTS magic_dude_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS magic_dude_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES magic_dude_threads(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily message cap tracking
CREATE TABLE IF NOT EXISTS magic_dude_daily_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  message_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Enable RLS (Row Level Security)
ALTER TABLE magic_dude_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_dude_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_dude_daily_caps ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own data
CREATE POLICY "Users can view own threads" ON magic_dude_threads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own threads" ON magic_dude_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own threads" ON magic_dude_threads
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own thread messages" ON magic_dude_messages
  FOR SELECT USING (thread_id IN (SELECT id FROM magic_dude_threads WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own thread messages" ON magic_dude_messages
  FOR INSERT WITH CHECK (thread_id IN (SELECT id FROM magic_dude_threads WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own daily caps" ON magic_dude_daily_caps
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily caps" ON magic_dude_daily_caps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily caps" ON magic_dude_daily_caps
  FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_magic_dude_threads_user_id ON magic_dude_threads(user_id, created_at DESC);
CREATE INDEX idx_magic_dude_messages_thread_id ON magic_dude_messages(thread_id, created_at);
CREATE INDEX idx_magic_dude_daily_caps_user_date ON magic_dude_daily_caps(user_id, date);
