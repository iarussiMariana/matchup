-- Mock users for testing (bypass auth trigger by inserting directly into profiles)
-- These are fake users for demo/testing purposes

-- Create mock auth.users first (with pre-generated UUIDs)
-- The trigger will auto-create profiles, but we also insert profiles directly

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'lucas.mock@spark.app', '', NOW(), '{"name":"Lucas","birth_date":"1998-05-10"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000002', 'beatriz.mock@spark.app', '', NOW(), '{"name":"Beatriz","birth_date":"2000-02-14"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000003', 'rafael.mock@spark.app', '', NOW(), '{"name":"Rafael","birth_date":"1996-11-20"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000004', 'camila.mock@spark.app', '', NOW(), '{"name":"Camila","birth_date":"1999-07-03"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000005', 'diego.mock@spark.app', '', NOW(), '{"name":"Diego","birth_date":"1997-09-18"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000006', 'isabela.mock@spark.app', '', NOW(), '{"name":"Isabela","birth_date":"2000-12-25"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000007', 'bruno.mock@spark.app', '', NOW(), '{"name":"Bruno","birth_date":"1995-04-08"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000008', 'larissa.mock@spark.app', '', NOW(), '{"name":"Larissa","birth_date":"2002-01-30"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000009', 'thiago.mock@spark.app', '', NOW(), '{"name":"Thiago","birth_date":"1994-06-15"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000010', 'julia.mock@spark.app', '', NOW(), '{"name":"Julia","birth_date":"1998-10-28"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000011', 'gabriel.mock@spark.app', '', NOW(), '{"name":"Gabriel","birth_date":"2000-03-12"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000012', 'mariana.mock@spark.app', '', NOW(), '{"name":"Mariana","birth_date":"1996-08-22"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000013', 'vinicius.mock@spark.app', '', NOW(), '{"name":"Vinicius","birth_date":"1999-04-17"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000014', 'sofia.mock@spark.app', '', NOW(), '{"name":"Sofia","birth_date":"1997-11-09"}', NOW(), NOW()),
  ('a0000000-0000-0000-0000-000000000015', 'andre.mock@spark.app', '', NOW(), '{"name":"Andre","birth_date":"1993-01-05"}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Update profiles with full mock data
UPDATE profiles SET
  age = 26, gender = 'homem', looking_for = 'mulher', bio = 'Musico nas horas vagas, dev durante o dia. Curto rock, vinil e churrasco de domingo.', avatar = '🧑‍🎤', color1 = '#A855F7', color2 = '#EC4899', city = 'Sao Paulo, SP', profession = 'Desenvolvedor', sign = 'Leao', verified = true, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000001';

UPDATE profiles SET
  age = 23, gender = 'mulher', looking_for = 'todos', bio = 'Designer grafica apaixonada por aquarela e cafe coado.', avatar = '👩‍🎨', color1 = '#F59E0B', color2 = '#EF4444', city = 'Sao Paulo, SP', profession = 'Designer', sign = 'Peixes', verified = true, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000002';

UPDATE profiles SET
  age = 28, gender = 'homem', looking_for = 'mulher', bio = 'Advogado, corredor de fim de semana e viciado em series.', avatar = '🧑‍💼', color1 = '#3B82F6', color2 = '#8B5CF6', city = 'Sao Paulo, SP', profession = 'Advogado', sign = 'Touro', verified = true, online = false, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000003';

UPDATE profiles SET
  age = 25, gender = 'mulher', looking_for = 'todos', bio = 'Medica veterinaria. Meu sonho e viajar o mundo resgatando animais.', avatar = '👩‍⚕️', color1 = '#10B981', color2 = '#06B6D4', city = 'Sao Paulo, SP', profession = 'Veterinaria', sign = 'Virgem', verified = true, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000004';

UPDATE profiles SET
  age = 27, gender = 'homem', looking_for = 'mulher', bio = 'Chef de cozinha. Faco o melhor risoto da cidade.', avatar = '🧑‍🍳', color1 = '#F97316', color2 = '#DC2626', city = 'Sao Paulo, SP', profession = 'Chef', sign = 'Escorpiao', verified = false, online = false, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000005';

UPDATE profiles SET
  age = 24, gender = 'mulher', looking_for = 'todos', bio = 'Programadora, gamer e mae de duas gatas.', avatar = '👩‍💻', color1 = '#8B5CF6', color2 = '#EC4899', city = 'Sao Paulo, SP', profession = 'Dev', sign = 'Gemeos', verified = true, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000006';

UPDATE profiles SET
  age = 29, gender = 'homem', looking_for = 'todos', bio = 'Professor de historia, leitor compulsivo e ciclista.', avatar = '🧑‍🏫', color1 = '#06B6D4', color2 = '#3B82F6', city = 'Sao Paulo, SP', profession = 'Professor', sign = 'Aquario', verified = true, online = false, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000007';

UPDATE profiles SET
  age = 22, gender = 'mulher', looking_for = 'todos', bio = 'Estudante de psicologia. Viciada em true crime e sushi.', avatar = '👩‍🎓', color1 = '#EC4899', color2 = '#F59E0B', city = 'Sao Paulo, SP', profession = 'Estudante', sign = 'Libra', verified = false, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000008';

UPDATE profiles SET
  age = 30, gender = 'homem', looking_for = 'mulher', bio = 'Engenheiro aeroespacial com os pes no chao. Amo astronomia.', avatar = '🧑‍🚀', color1 = '#0EA5E9', color2 = '#1E40AF', city = 'Sao Paulo, SP', profession = 'Engenheiro', sign = 'Sagitario', verified = true, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000009';

UPDATE profiles SET
  age = 26, gender = 'mulher', looking_for = 'todos', bio = 'Advogada criminalista por dia, chef amadora por hobby.', avatar = '👩‍⚖️', color1 = '#E11D48', color2 = '#BE185D', city = 'Sao Paulo, SP', profession = 'Advogada', sign = 'Capricornio', verified = true, online = false, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000010';

UPDATE profiles SET
  age = 24, gender = 'homem', looking_for = 'todos', bio = 'Ilustrador freelancer. Viciado em cafe e mangas.', avatar = '🧑‍🎨', color1 = '#7C3AED', color2 = '#4F46E5', city = 'Sao Paulo, SP', profession = 'Ilustrador', sign = 'Aries', verified = false, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000011';

UPDATE profiles SET
  age = 28, gender = 'mulher', looking_for = 'todos', bio = 'Biologa marinha. Passo metade do tempo no mar.', avatar = '👩‍🔬', color1 = '#059669', color2 = '#10B981', city = 'Sao Paulo, SP', profession = 'Biologa', sign = 'Cancer', verified = true, online = false, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000012';

UPDATE profiles SET
  age = 25, gender = 'homem', looking_for = 'todos', bio = 'Publicitario criativo. Adoro stand-up e churrasco.', avatar = '🧑‍🎓', color1 = '#EA580C', color2 = '#F59E0B', city = 'Sao Paulo, SP', profession = 'Publicitario', sign = 'Gemeos', verified = false, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000013';

UPDATE profiles SET
  age = 27, gender = 'mulher', looking_for = 'todos', bio = 'Professora de ingles apaixonada por viagens. 23 paises visitados.', avatar = '👩‍🏫', color1 = '#DB2777', color2 = '#7C3AED', city = 'Sao Paulo, SP', profession = 'Professora', sign = 'Virgem', verified = true, online = true, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000014';

UPDATE profiles SET
  age = 31, gender = 'homem', looking_for = 'todos', bio = 'Empresario, pai de pet e apaixonado por jazz.', avatar = '🧑‍💼', color1 = '#1E40AF', color2 = '#0EA5E9', city = 'Sao Paulo, SP', profession = 'Empresario', sign = 'Leao', verified = true, online = false, onboarding_complete = true
WHERE id = 'a0000000-0000-0000-0000-000000000015';

-- Add interests for each mock user
INSERT INTO user_interests (user_id, interest) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Musica'),
  ('a0000000-0000-0000-0000-000000000001', 'Bar'),
  ('a0000000-0000-0000-0000-000000000001', 'Cachorros'),
  ('a0000000-0000-0000-0000-000000000002', 'Arte'),
  ('a0000000-0000-0000-0000-000000000002', 'Cafe'),
  ('a0000000-0000-0000-0000-000000000002', 'Fotografia'),
  ('a0000000-0000-0000-0000-000000000003', 'Corrida'),
  ('a0000000-0000-0000-0000-000000000003', 'Vinho'),
  ('a0000000-0000-0000-0000-000000000003', 'Series'),
  ('a0000000-0000-0000-0000-000000000004', 'Pets'),
  ('a0000000-0000-0000-0000-000000000004', 'Viagens'),
  ('a0000000-0000-0000-0000-000000000004', 'Yoga'),
  ('a0000000-0000-0000-0000-000000000005', 'Gastronomia'),
  ('a0000000-0000-0000-0000-000000000005', 'Vinho'),
  ('a0000000-0000-0000-0000-000000000005', 'Futebol'),
  ('a0000000-0000-0000-0000-000000000006', 'Games'),
  ('a0000000-0000-0000-0000-000000000006', 'Gatos'),
  ('a0000000-0000-0000-0000-000000000006', 'Animes'),
  ('a0000000-0000-0000-0000-000000000007', 'Livros'),
  ('a0000000-0000-0000-0000-000000000007', 'Ciclismo'),
  ('a0000000-0000-0000-0000-000000000007', 'Cafe'),
  ('a0000000-0000-0000-0000-000000000008', 'Psicologia'),
  ('a0000000-0000-0000-0000-000000000008', 'Sushi'),
  ('a0000000-0000-0000-0000-000000000008', 'Cachorros'),
  ('a0000000-0000-0000-0000-000000000009', 'Astronomia'),
  ('a0000000-0000-0000-0000-000000000009', 'Cerveja'),
  ('a0000000-0000-0000-0000-000000000009', 'Trilhas'),
  ('a0000000-0000-0000-0000-000000000010', 'Vinho'),
  ('a0000000-0000-0000-0000-000000000010', 'Livros'),
  ('a0000000-0000-0000-0000-000000000010', 'Teatro'),
  ('a0000000-0000-0000-0000-000000000011', 'Arte'),
  ('a0000000-0000-0000-0000-000000000011', 'Cafe'),
  ('a0000000-0000-0000-0000-000000000011', 'Cinema'),
  ('a0000000-0000-0000-0000-000000000012', 'Praia'),
  ('a0000000-0000-0000-0000-000000000012', 'Ciencia'),
  ('a0000000-0000-0000-0000-000000000012', 'Fotografia'),
  ('a0000000-0000-0000-0000-000000000013', 'Comedia'),
  ('a0000000-0000-0000-0000-000000000013', 'Churrasco'),
  ('a0000000-0000-0000-0000-000000000013', 'Surf'),
  ('a0000000-0000-0000-0000-000000000014', 'Viagens'),
  ('a0000000-0000-0000-0000-000000000014', 'Livros'),
  ('a0000000-0000-0000-0000-000000000014', 'Cafe'),
  ('a0000000-0000-0000-0000-000000000015', 'Jazz'),
  ('a0000000-0000-0000-0000-000000000015', 'Cachorros'),
  ('a0000000-0000-0000-0000-000000000015', 'Cerveja')
ON CONFLICT (user_id, interest) DO NOTHING;