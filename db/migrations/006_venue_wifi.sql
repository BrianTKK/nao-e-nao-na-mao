-- Wi-Fi do local (decisão do Brian, 16/11/2026): "Vamos adicionar a opção de
-- wi-fi, como opção opcional dentro do wi-fi do local também". É o disfarce do
-- bar sem cardápio (e uma segunda opção do bar com cardápio): a tela mostra a
-- rede e a senha, como quem pediu a senha do Wi-Fi.
-- A senha é dado do bar, não credencial do sistema: aparece só para quem abriu
-- a página do QR daquele bar. Nula = rede aberta.
alter table venues add column wifi_ssid text
  check (wifi_ssid is null or (length(wifi_ssid) between 1 and 32 and wifi_ssid !~ '[[:cntrl:]]'));
alter table venues add column wifi_password text
  check (wifi_password is null or (length(wifi_password) between 1 and 63 and wifi_password !~ '[[:cntrl:]]'));
alter table venues add constraint wifi_password_needs_ssid check (wifi_password is null or wifi_ssid is not null);
