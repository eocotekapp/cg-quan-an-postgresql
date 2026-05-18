INSERT INTO tables(id,name,seats,zone,status,locked) VALUES
('B01','B01',4,'Ao cá','free',false),
('B02','B02',4,'Góc phải','free',false),
('B03','B03',6,'Góc phải','free',false),
('B04','B04',8,'Gần ao','free',false),
('B05','B05',10,'Nhóm đông','free',false)
ON CONFLICT(id) DO NOTHING;

INSERT INTO menu(id,name,category,price,original_price,profit,popular,icon,description,available) VALUES
('com-ga-tieu-den','Cơm gà sốt tiêu đen','main',59000,35000,24000,99,'🍗','Cơm nóng, gà mềm, sốt tiêu đen đậm vị.',true),
('bun-bo-hue','Bún bò Huế','main',65000,39000,26000,95,'🍜','Nước dùng thơm, topping đầy đủ.',true),
('pho-bo-tai','Phở bò tái','main',62000,37000,25000,96,'🥣','Bò mềm, nước phở trong và ngọt.',true),
('mi-xao-hai-san','Mì xào hải sản','main',79000,52000,27000,88,'🍝','Hải sản tươi, rau giòn, sốt vừa miệng.',true),
('tra-dao-cam-sa','Trà đào cam sả','drink',35000,15000,20000,92,'🍑','Mát lạnh, thơm đào và sả.',true),
('ca-phe-sua-da','Cà phê sữa đá','drink',29000,11000,18000,90,'☕','Đậm vị Việt Nam.',true)
ON CONFLICT(id) DO NOTHING;
