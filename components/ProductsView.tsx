import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import PageHeader from './PageHeader';
import { useAuth } from '../contexts/AuthContext';

const ProductsView: React.FC = () => {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null);

    // Form state
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '',
        category: 'Material',
        unit: 'un',
        price: 0,
        supplier_id: '',
        is_signage: false,
        cost_price: 0,
        observation: '',
        registration_date: new Date().toISOString().split('T')[0],
        image: '',
        storage_location: ''
    });

    const [suppliers, setSuppliers] = useState<{ id: string, name: string }[]>([]);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('product_catalog')
            .select('*')
            .order('name');

        if (error) {
            console.error('Error fetching products:', error);
        } else if (data) {
            setProducts(data);
        }

        // Fetch suppliers for dropdown
        const { data: suppliersData } = await supabase.from('suppliers').select('id, name').order('name');
        if (suppliersData) setSuppliers(suppliersData);

        setLoading(false);
    };

    const handleOpenModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                category: product.category,
                unit: product.unit,
                price: product.price,
                supplier_id: product.supplier_id || '',
                is_signage: !!product.is_signage,
                cost_price: product.cost_price || 0,
                observation: product.observation || '',
                registration_date: product.registration_date || new Date().toISOString().split('T')[0],
                image: product.image || '',
                storage_location: product.storage_location || ''
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                category: 'Material',
                unit: 'un',
                price: 0,
                supplier_id: '',
                is_signage: false,
                cost_price: 0,
                observation: '',
                registration_date: new Date().toISOString().split('T')[0],
                image: '',
                storage_location: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setFormData({ ...formData, image: reader.result as string });
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingProduct) {
                const { error } = await supabase
                    .from('product_catalog')
                    .update(formData)
                    .eq('id', editingProduct.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('product_catalog')
                    .insert([{ ...formData, user_id: user?.id }]);
                if (error) throw error;
            }
            fetchProducts();
            handleCloseModal();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Erro ao salvar produto. Verifique o console.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este produto?')) return;

        const { error } = await supabase
            .from('product_catalog')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting product:', error);
            alert('Erro ao excluir produto.');
        } else {
            fetchProducts();
        }
    };

    const handleSeedProducts = async () => {
        setLoading(true);
        // Data provided by user. Parsing logic: Last token is price (pt-BR format), rest is name.
        // Defaulting category to 'Material' and unit to 'un' as they were not provided.
        const rawData = `
Abraçadeira pacote com 100	200
Abrigo para extintor externo sobrepor	320
Abrigo, caixa para Mangueira 90x60x17 sobrepor	510
ACIONADOR MANUAL ENDER. SEM SIRENE COMPACT SEGURIMAX	127,78
ACIONADOR MANUAL C/ SIRENE CONVENCIONAL segurirmax	66
Acionador Manual  Betta Harpia Endereçável	270
ACIONADOR MANUAL ENDEREÇAVEL COM SIRENE COMPACT SEGURIMAX	206,58
ACIONADOR MANUAL ENDERECAVEL S/ SIRENE AME 521, Intelbrás	136,64
Acionador Manual endereçável AM-E (c/ Mart)	0
Acionador Manual endereçável AM-E (c/ Mart) Ilumac	0
Acionador Manual endereçável Detectomat	1284,68
Acionador Manual endereçável Detectomat REF: 32433	0
Acionador manual endereçável Verin	0
Acrílico com impressão. Com a mensagem no visor (em caso de incêndio aperte aqui).	16
Adaptador de PVC 50 mm	0
CHAVE STORZ P/CONEXOES 1.1/2X2.1/2 ALUM	10,32
ADAPTADOR PRA ESGUICHO 1.1/2X2.1/2" ALUMINIO	37,64
Adesivo Epoxi profissional, cola 1,8kg	514
Amplificador de Linha Betta	399
ARALDITE,ADESIVO EPOXI 1,8KG PROFISSIONAL	1161
Balão de AR/ TANQUE DE PRESSAO 12L	640
Barra Anti Pânico Dupla para Saída de Emergência.	0
Barra chata em aluminio 6 metros 7/8 x 1/8	99,5
BARRAMENTO TERRA 08 FUROS C/SUP VD	30,62
TUBO PVC SOLDAVEL 50MM	172,46
Barreira plástica p AMB pacote 25 peças	180
BASE P/ ACION MAN FDM225 FDMH295-R	0
Base padrão PL BR Detectomat	72,92
Base padrão PL BR Detectomat REF 32242	0
BASE MASTRO 2" POLEGADAS, ACO ELETRO	95,66
BATERIA 12V 7ah	220
Bateria 12v 115A cral estacionária para gerador	0
Bateria 12 volts 5 H/A	135
Bateria 12v p central de alarme compatível.	0
Bateria 150 amperes a base de troca	0
Bateria 150 amperes a base de troca p GMG	0
Bateria 150 Amperes cral a base de troca, garantia de 15 meses sem manutenção	1240
BATERIA NÃO RECARREGÁVEL LÍTIO 3,6V 2500MAH - AA	0
Bateria selada 12v 1.3 Amper	102
Bateria selada 12v  26 ah Unipower.	0
Bateria selada 12 V 18 AH	540
BICO DE SPRINKLER PENDENTE 1/2" 68 K-80 CR 15MM SPK	41,7
BOIA AUTOMATICO DE NIVEL 1,2MT, SOORANO	55,14
BOMBA CENTRIFUGA TRIFASICA PRA INCENDIO ,5CV 2.1/2X2.1/2" BPI21R	11429,6
Botão de emergência	0
Bucha redução galvanizado 1/2" x 1/4"	5,5
Bucha 2.1/2 x 1" de redução  galvanizado	88,58
Bucha 3"x 2 .1/2 Redução  galvanizado SEGURIMAX	81,82
Bucha de redução 2"x1" Galvanizado	33,84
Bucha de redução  Galvanizado 2.1/2×1"	39,74
Cabo 1,5 mm flexível vermelho 750v	255,9
Cabo flexível 2,5 mm vermelho 750V	390,14
Cabo 4p p/ CFTV, CABO REDE LAN 4P CAT5E AZUL CMX 305M MEGATRON	1211,56
Cabo blindado 4 vias para incêndio.	0
Cabo blindado p/ incêndio 2 x 1,5mm	7,2
CABO DE INCENDIO 2X1.50MM NBR 17240 VERMELHO	10,86
CABO FLEXIVEL 6,0MM 750V	997,8
CABO COAXIAL CFTV BIP 80% 4MM BR 100M	309
CAIXA DE INSPECAO PRA ,ATERRAMENTO, 20X23CM PVC	22,92
CAIXA CONDULETE PVC  4X2 05 ENTRADA	8,32
Caixa de registro de gás com tampa P33	0
CAIXA DE MEDICAO METAL TRIFASICO, CEB P1	838,4
Caixa CONDULETE MULTIPLO 3/4" X S/T	14,14
Câmera Bullet ultra  HD com proteção 	299
CANOPLA PRA /SPRINKLER 1/2" ALUMINIO	4,72
CAPTOR FRANKLIN COM 2 DECIDAS 300MM LATAO 3/4	213
Carregador de bateria do GMG	0
Carretel Manual para mangueira 1-2 Polegada capacidade 50 Metros	0
Central de alarme de incêndio CIE 1060 Intelbrás	1200
CENTRAL INCENDIO 12 LACOS 12V CONVENCIONAL SEGURIMAX	971,7
Central de alarme de incêndio 8 laços com display digital	0
CENTRAL DE INCENDIO 125 LACOS 24V ENDEREÇAVEL SEGURIMAX	2895,38
Central de alarme de incêndio endereçável com display digital 250 endereços	0
CENTRAL DE INCENDIO 12 LACOS 24V CONVENCIONAL SEGURIMAX	1193,72
Central de alarme de incêndio Verin VR 40. com display digital sem baterias.	2.500,00
CENTRAL INCENDIO 24 LACOS 12V CONVENCIONAL SEGURIMAX	887,28
Central de alarme digital verin VR-08 com display digital sem baterias.	890
Central de alarme incêndio convencional digital FCS 24B	1790
Central de detecteção incêndio Detectomat 3004 plus.	20082,82
Central de incêndio endereçável com software atualizado.	0
Central de incêndio endereçavel harpia com software atualizado.	0
Central de incêndio Intelbrás  CIE 1125	0
CENTRAL DETEC 4 LINHAS + 2LEDS FC724-ZE	0
Central/Fonte de incêndio convencional.	0
Central Premium600 Solução Hibrida-Display Touch - Com Fio e Sem Fio.	7425
Central repetidora com display digital endereçável	0
Central Tecnohold endereçável	0
Chave storz dupla	12
Cola grey	0
Cola industrial 500g	299
Cola industrial epoxi 300g	350
ADESIVO PVC 175GR COM /PINCEL	16,52
Conector Balun passivo.	0
Conector BNC com mola	29
Conector bnc macho borne	31
Conector botinha 35 mm Tipo terminal de pressão.	11,8
Conector botinha 50mm/Terminal de pressão.	18,3
CONECTOR BOTINHA ,TERMINAL DE PRESSAO 16MM	9,08
Conector U CLIPS PRA,REBAR GALVANIZADO 3/8" 8-10MM	5,06
Conector P4 fêmea com borne p câmera	11
Conector P4 macho com borne p camera	29
CONECTOR P/HASTE DE ATERRAM 3/4"	5,3
CONECTOR SPLIT BOLD 35MM	22,78
CONECTOR SPLIT BOLD 50MM	31,1
Conector tipo Clipes, CLIPS P/REBAR GALV 3/8" 8-10MM  termotecnica	5,2
Contactora bobina 220v	120
COPEX METAL FLEX REV 3/4" 30MT	540,9
CORDAO PARALELO TORCIDO 2X1,5MM BR	578,68
CORDOALHA 35MM COBREADA NORMATIZADA	35,6
CORDOALHA 50MM COBRE NU	78,54
Cotovelo 1 1/2" galvanizado 90º	42,64
cotovelo  1 1/4" Galvanizado 45º	35,66
Cotovelo galvanizado 45 1"	21,94
Cotovelo galvanizado 90º 1"	14,58
Cotovelo galvanizado 90º 2.1/2"	70,50
cotovelo 2" polegadas Galvanizado 45º	67,02
Cotovelo 2" galvanizado 90º	61,7
COTOVELO GALVANIZADO 90, 3/4"	14,32
COTOVELO GALVANIZADO 45, 4"	353,72
Cotovelo reduzido 1 x 1/2" galvanizado 90º	23,22
CURVA GALVANIZADA F 2" ,90	142,58
Curva galvanizado Eletrolítica 90°×03/4"	3,88
Detector de fumaça endereçável Detectomat.	729,6
Detector de fumaça endereçável Detectomat, REF 30009	0
Detector de fumaça endereçável Ilumac	0
Detector de fumaça endereçável skyfire com base.	0
Detector de fumaça endereçável Verin	0
Detector de Fumaça Óptico Betta	340
Detector de fumaça VR convencional	0
Detector de temperatura endereçável	323,66
DETECTOR DE TEMPERATURA CONVEBCIONAL	170,06
DPS UNIPOLAR 45KA CLASSE II	70,52
BOMBA CENT TRIFAZICA 3CV 2.1/2X2.1/2"BPI92SR	5881,84
ELETRODUTO PVC CORRUG 25MMX50MT AM	132,98
ELETRODUTO PVC RIGIDO ROSC 3MT 3/4"	25,42
ESGUICHO 1.1/2" JATO REGULAVEL 3 POSIÇOES ALUMINIO	167,38
Esguicho de jato Sólido alum	35,4
ESTICADOR PRA CABO DE ACO 1/4-6MM	4,18
ESTICADOR PRA CABO DE ACO 3/8-10MM	8,42
ESTICADOR PRA CABO DE ACO 7/8-22MM	155,68
Fita ante-corrosiva. p gás FITA SILVERTAPE 25MTX48MM	30,96
FITA DEMARCACAO SOLO 50MMX30MT AMARELO	49,28
FITA ISOLANTE 18MMX20METRO	11,72
Fita perfurada caixa, 17X0,40X30 GALVANIZADO	57,52
FITA VEDA ROSCA 12MMX 25 METRO	2,5
FLANGE GALVANIZADO SEXTAVADA 3" POLEGADAS	224,1
ADAPTADO AA FLANGE+ANEL CAIXA  DAGUA 50MM 1.1/2	33,72
AGUA RAZ 900ML	22,56
TINTA ESMALTE BRIL STD 3,0LT HIPER AMARELO	129,86
TINTA ESMALTE BRIL STD 3,0LT DELANIL PRETO	137,74
HASTE PRA ATERRAMENTO 3/8" 3,00 METROS	42,06
RODANA ISOLADOR SIMP 2 DECIDA MASTRO 1.1/2"ACO ELET	30,92
JOELHO PVC SOLDAVEL 90 50MM	6,68
UNIAO GALVANIZADO C/ASSENTO BRONZE 2.1/2"	333,9
LIXA MASSA/MAD G120 50FOLHAS A257	54,14
LUMIN EMERGENCIA 30 LEDS	31,52
Luva  1" galvanizado	16,88
Luva galvanizado 2"	43,76
Luva  3/4" galvanizado	9,74
Luva galvanizado redução 1x1/2"	16,42
Mangueira de incêndio tipo I MANG INCENDIO TIPO I 1.1/2 15M	599,8
Mangueira de incêndio tipo II MANG INCENDIO TIPO II 1.1/2 15M	626,96
MAO FRANCESA 20CM PRATA	16,6
MAO FRANCESA 15CM PRATA	13,94
Martelinho para acionador manual do tipo quedra vidro	58
Mastro 3 metros aço galvanizado com redução 1.1/2"	393,26
Módulo de entrada Ezalpha	0
Módulo de entrada skyfire	0
MODULO ISOLADOR DE LACO ENDERECAVEL SEGURIMAX	221,38
MODULO ISOLADOR DE LACO COMPACT SEGURIMAX	172,52
MODULO SAIDA ENDERECAVEL SEGURIMAX	275,62
MODULO SAIDA COMPACT SEGURIMAX	217,1
Módulo de saída de sirene Detectomat. REF: 30211	0
Módulo de zona convencional Detectomat	0
Módulo Isolador de Curto Circuito para Central Betta	399
Modulo, monitor de zona VRE	0
Niple 1/4" galvanizado	11,96
Niple galvanizado 1"	10,42
NIPLE DUPLO GALVANIZADO 3/4"	10,36
Niple duplo de  4"polegadas galvanizado.	187,02
Nobreak 1440 VA	0
P1 Proibido fumar	0
P4 Elevador	0
PAINEL ENDEREÇÁVEL  DE INCÊNDIoO, FÁB. SULETRON 500 endereços sem baterias	0
PARAF AA CHIP MDF CH PH 4,5X45 200UN BC	27,98
Parabolt chumbador, 3/8X3"	2,94
PARAF PB TROM PHP GESSO 3,5X25 1000UN FO	76,52
Placa de sinalização de emergência.	20
Placa E1 Sirene	0
Placa E20 Alarme	0
Placa E5b ABC	0
Placa E5C co2	0
Placa E8 Hidrante	0
Placa para abrigo de hidrante com adesivo  ( logo ).	0
Placa para dois laços DLI X1l Detectomat	16553
PLACA PARA LOOP - MÓDULO LAÇO P/ 125 ENDEREÇOS	0
Placa S17-1	0
Placa S17-10	0
Placa S17-2	0
Placa S17-3	0
Placa S17-4	0
Placa S17-5	0
Placa S17-6	0
Placa S17-7	0
Placa S17-8	0
Placa S17-9	0
Placa S17-SS	0
Placa S17 SS1	0
Placa S17-T	0
Placa S2 Boneco direita	10
Placa S2 Boneco esquerdo	0
Placa S8 escada direita	0
Placa S9 escada esquerda	0
Placa Saída de emergência porta corta fogo	0
Placa	0
Porta Corta Fogo P 90 2.10x90 . Porta de emergência.	2400
Presilha tipo chapinha em U PRESILHA TIPO U P/CABO 16/50MM2	2,1
Pressostato 20/40	150
QUADRO COMANDO 400X300X200 S/FLANGE	427,06
QUADRO COMANDO 400X400X200 COM FLANGE	555,02
QUADRO COMANDO 500X400X200 COM FLANGE	373,56
REGISTRO ESFERA METAL 1.1/2"	166,98
Registro esfera latão alavanca 1"	76,46
Registro esfera metal 2"	337
Registro bruto de gaveta 2" polegada	306,52
Registro 3/4" esfera	31,1
Registro bruto gaveta 4" polegada	1371,62
REGISTRO ESFERA METAL 2" POLEGADA	357,28
RELE FALTA DE FASE	189,05
S11 SAIDA	0
S12 Saída D	0
S13 Saída Esquerda	0
S19 PCF Mantenha fechada	0
S2 Boneco esquerdo	0
S3 SIGA	0
SELANTE PU BRANCO 400GR PU40	21,44
Seta C1 22x11	0
Seta C1 25x15	0
SIRENE SINALIZADOR AUDIOVISUAL CONVENCIONAL. COM SIRENE	133,9
Sirene Audiovisual 1 som Bitonal ? Betta	360
SINALIZADOR DUPLO COM FOTOCELULA	191,86
SINALIZADOR AUDIOVISUAL ENDER. SMART	431,16
SP26 Gás inflamavel	0
Suporte extintor parede	0
Te galvanizado  1" POLEGADA 90GR	26,7
Te galvanizado 2" POLEGADA 90GR	84,72
Te galvanizado  3/4" 90GR	16,86
Te galvanizado 3"POLEGADA 90GR	220
Te galvanizado 4" 90GR	219,72
Te reduzido galvanizado 1.1/2 x 1"	62,96
Te reduzido 1"x1/2 galvanizado	32,22
Tee reduzido 2 1/2" x 1"	196,76
Te reduzido 2"x 1"galvanizado	91,98
Tubo  galvanizado 1.1/4" galvanizado 6M	445,02
Tubo galvanizado 1" galvanizado	391,8
Tubo galvanizado 2.1/2" 6Metro	858,5
Tubo galvanizado 2" galvanizado 6M	857,9
Tubo 3/4" galvanizado	265,14
Tubo 3" galvanizado	1139,3
Tubo galvanizado 4" Polegadas  6M	1886,82
Tubo, ELETROD GALV ZINC 3M LEV 3/4"	30
Tubo galvanizado 1 1/2" galvanizado.	619,26
UNIA DE 1" GALVANIZADO COM ASSENTO BRONZE	72,6
União galvanizado 2 1/2" assento bronze	333,9
União galvanizado assento bronze 2"	199,16
União Galvanizado com assento bronze  3/4"	62,7
União Galvanizado Assento Bronze 4"	1013,84
União soldável de PVC 50 mm	48,44
Unidut  multiplo Conector caixa  condulete 3/4	3,66
Conector para caixa multipla petrolet 3/4	3,56
Válvula Retençao Horizontal 1"	97,04
Válvula De Retençao Vertical 1 1/4"	115,08
Válvula De Retençao Horizontal 2 1/2"	605,42
Válvula De Retençao Vertical 2"	278,26
Válvula De Retençao Vertical 3"	643,08
Válvula de retenção vertical 2.1/2"	485,48
Válvula De Retençao horizontal de 2"	319,7
VálvulaDe Retençao horizontal de 4"	1490,34
Válvula Solenoide Gás GLP. 3/4"	0
Vedarosca	0
Mini captor aéreo	78
Fixador universal	45
Luva de redução 3/4" x 1/2"	16
TE GALVANIZADO DE REDUCAO 3/4X1/2"	22,94
Mangueira Flexível p/ glp	100
Regulador 2 estágio com registro (glp)	1
Cilindro de Gás GLP P45	1
NIPLE DUPLO GALVANIZADO 1/2"	7,7
Luva de redução 1" x 3/4" galvanizado	18
TAMPAO CEGO COM /CORRENTE 2.1/2" ALUM	105,68
Cap tampão galvanizado 3/4"	10
REGISTRO ESFERA METAL 1/2"	21,56
Parafuso sextavado com porca e arruela	1
Parafuso Sextavado Brocante curto 5,5mmx19mm, PARAF AB FLAN SEXT 12(5,5)X3/4"	1
Parafuso Sextavado Brocante médio 5,5mmx25mm, PARAF AB FLAN SEXT 12(5,5)X1"	1
CONECTOR PRA /HASTE DE ATERRAMENTO 5/8 GTDU	10,38
Caixa De Inspeção  Aterramento 25x25 quadrada reforçada pvc 	100
Bomba  12,5 cv p/ incêndio trif BPI 22R 1/2 Shneider (novembro 2023 preço de compra)	1
CORDOALHA 35MM COBRE NU	57,88
Dobradiça com mola para porta corta fogo, unidade 	79
MotoBomba  10cv Diesel p/ incêndio e bomba THEBE com partida elétrica. (novembro 2023 de compra)	12900
MotoBomba  13cv Diesel p/ incêndio e bomba THEBE com partida elétrica. (novembro 2023 de compra)	19000
Pressostato 20/40 preço de compra 31.05.23	1
Pressostato 80-120 psi 200,00 janeiro 2024	1
Preventiva,  LAUDO ESTANQUEIDADE REDE GLP	1
Preventiva, Alarme	1
Regulador Gás Glp 15 Kg/h 1/2 Baixa Pressão Estágio Único, acho que (Aliança).	299
Regulador Industrial Gás (Imar) Fh 2002 15 Kg/h Laranja Segundo Estagio	245
Repetidor ascael, ACDE-RS-A 1024 a a linha 1024 com central 24/16 (24,01,24) preço do distribuidor.	1
Adesivo personalizado	90
MODULO DE ENTRADA MDI 521 intelbrás	250
Diversos como vedantes, acabamentos, massa pronta, rolinhos, pinceis, etc.	500
Fornecimento da casa de bombas ( Abrigo)  do conjunto de   bombas   conforme norma do CBM-DF	12000
Seguro em Locais de Terceiros com a importância de R$ 300.000 (trezentos mil reais)	1000
Compound adesivo epoxi, vedacit. 1kg,	122
CABO PP 4X10MM 1KV CLASSE 2	97,66
DISJUNTOR N TRIPOLAR.C 025A 3,0KA 5SL132-7MB	114,08
Medidor De Gás Glp 0.6 Lao Residencial 50 Kpa Ga-3018 Medidor De Gás Glp 0.6 Lao Residencial 50 Kpa Ga-3018  (Este produto)	659
ACIONADOR MANUAL ENDERECAVEL - IRIS MCP150	496
Central de Alarme	1
Detector de fumaça Convencional 12v/24v	88,62
Descida de Spda aparente em metro	2000
Caixa de inspeção completa	1
Luminária de emergência com circuito	1
Extintor ABC 6kg com gancho.	239
Extintor Co2 em Gancho	999,8
Placas,	1
Bomba de incêndio	1
CURVA CONDULETE SOLD PVC  90 3/4"	4,14
Luva pvc 3/4	5
Caixa bep/bel barramento de equiponcialização	490
Tubo 1/2" galvanizado 6m	195,16
Recarga Extintor ABC 6Kg	35
Recarga Extintor Co2 6kg	120
Revisão eletrobomba 5cv com rebobinamento.	1590
Demarcação de piso	100
Cotovelo 2 1/2" polegadas galvanizado 45º	140,66
TRINCHA 4" CERDA TRADICIONAL 302	16,74
Cotovelo 1/2" polegadas galvanizado 90º	9,18
Luva  galvanizado 3''	169,36
Cotovelo 1 1/2" galvanizado 45º	44,02
Cotovelo 1/2" galvanizado 45º	9,22
Bloco autônomo led de emergência 2200 Lumens 2 farois	274,88
Bateria 12v 2.3 ah	240
Tirante ( Barra roscada zincada de 1/4 3m")	16,82
Fechadura Para Porta Corta Fogo Sobrepor S/chave Cor Preto	179
Fechadura Porta Corta Fogo e Saída De Emergência Com Chave Preta	399
Bomba incêndio 220/380v 7,5cv	10900
Válvula Retenção Pé Com Crivo Sucção Dn 2'' Fundo De Poço	299
Abraçadeira gota 1" galvanizada	3,5
Abraçadeira teste	1
Módulo de entrada, mini módulo Skyfire	590
FITA ANTI DERRAPAANTE 50MMX20MT PRETO	173,26
ABRACADEIRA GOTA 2.1/2"	3,7
Barramento Pente Trifásico 12 Polos 120a Brum	0
DR Disjuntor diferencial 4 Polos 100A 30ma WEG	606
Dps dispositivo protetor de surto 275v 20ka Clamper	0
Cabo Flexivel 50mm /metro	0
Cola industrial Epoxi 1 kg	0
Bomba Jockey 1cv	0
Detector fumaça op720 Siemens	600
Detector de Temperatura HI722 Siemens da 722pro	510
PARAFUSO PHILLIPS S8 4,8X45MM	70
ADAPTADOR PVC 01/2" Vermelho	1,28
CURVA GALV ZINC 90 3/4"	6,5
MÓDULO DE ZONA TELETEK MCZ	934
Mangueira de incêndio tipo 1	412
ABRIGO, CAIXA DE INCENDIO EMBUTIR 90X60X17	507,14
INP ADAPTADOR D PVC VERMELHO 01/2" ADP012V.	1,28
Adaptador pra caixinha condulete vermelho 01/2	3,58
Curva condulete vermelha 01/2 S/R	3,48
Luva condulete pvc vermelha 01/2 S/R	2,74
Abraçadeira pra condulete pvc vermelho 01/2	3,8
Tampa cega pra condulete  vermelho 3/4	5,82
Cabo de incêndio vermelho 2×1,5mm	9,1
Tomada 2P+T PB 10A/250 S/Placa-20140/0	6,78
Tampa condulete hexagonal vertical	4,56
Caixa múltipla sem tampa Petrolete 03/4"	11,3
Cordoalha de cobre nu 016mm	13,88
Terminal botinha mc 016mm	6,72
Conector Split Bolt CP 35mm	17,84
Válvula de retenção Horizontal 3" polegadas	610,18
Botina Nobuck Pu Biden Cafe	289,18
Alicate universal 8" 1000v aço carbono	57,82
Tinta spray vermelho 400ML 250gr	23,62
Lâmpada led bulb 9w bv 810lm 3k	5,22
Plafon pvc E27 100w	4,84
Chave phillips 3/16×5" imantada	5,78
Chave phillips 1/4×4" imantada	7,56
Chave phillips 1/8×6" imantada	3,32
CHAVE DE FENDA 1/8X5" IMANTADA	3,04
CHAVE PHILLIPS 1/8X6" IMANTADA	3,58
CHAVE PHILLIPS 1/8X2" IMANTADA	2,96
FILTRO DE LINHA 3 TOMADA 2P+T PT	33,28
SERRA COPO AÇO RAP BI-METAL 22MM 7/8"	26,26
CAIXA MEDIDOR TRIFÁSICO P1 VISOR DE VIDRO - 52X26X18CM	159,38
VALVULA DE RETENÇÃO HORIZONTAL 2.1/2	420,08
UNIAO GALVANIZADO 2.1/2 ASS.BRONZE	220,24
TE GALVANIZADO RED 1X1/2	23,24
Niple galvanizado 1.1/4"	15,1
Tubo pvc vermelho 01/2"	15,88
Adaptador pra caixa de pvc vermelho /2"	1,28
Braçadeira vermelho de pvc  01/2"	0,98
Caixa entradas pra pvc vermelho 03/4"	6,28
Cotovelo de pvc vermelho 01/2"	6,5
Curva de pvc vermelho 90°graus 01/2"	3,52
Tampão pra caixa de pvc vermelho	0,5
Caixa entrada de pvc cinza 03/4"	6,28
Adaptador de pvc cinza 01/2"	1,16
Cotovelo pvc cinza 01/2"	4,74
Braçadeira pvc cinza 01/2"	0,9
Tampa condulete cega cinza pvc 03/4"	2,72
Tubo eletroduto condulete pvc vermelho 01/2"	15,76
Conector pra caixa múltipla 03/4"	3,56
Te galvanizado 1"	19,12
Bucha de redução galvanizado 1/2"×1/4"	5,52
Cabo de incêndio Blindado vermelho 2x1,5mm 600v	9,9
Módulo zona DI-9319E GST	645,74
Detector optico de fumaça endereçavel DI-9102E GST	385,76
Detector de fumaça endereçavel-3 fios se D-13120199m base	230
Detector de temperatura Térmico E Termovelocimétrico - 3 Fios SEM BASE.D13120243	230
CENTRAL ALARME ENDEREÇAVEL SIRIUS COMPACT II 125 1L S/BAT	3650
BATERIA ESTACIONÁRIA SELADA 12V2,2A	172
ACIONADOR MANUAL SOBREPOR SIRIUS AMQ-D	184
SIRENE AUDIOVISUAL SOBREPOR SIRIUS SAVQI-D	270
DETECTOR DE FUMACA OPTICO BRANCO SIRIUS SDO-D	240
DETECTOR DE TEMPERATURA TERMOVELOCIMETRICO BRANCO SIRIUS TDV-D A2	250
PROGRAMADOR PORTATIL ENDERECAVEL PPD-E	2160
MODULO DE ENTRADA DE ZONA SIRIUS MZE2-D	410
DETECTOR FUMACA OPTICO  CONVENCIONAL SDO-C	152
CENTRAL ALARME CONVENCIONAL CAC 06.24 S/BAT	538
DETECTOR ENDEREÇÁVEL DE FUMAÇA IRIS S130 COM BASE	520
ACOPLAMENTO RANHURADO RIGIDO 3"	90
Broca Plus sds 08×110mm	19,46
Niple duplo redução galvanizado 1/2"×1/4"	9,42
Luva pra mão pu tátil forr PT M	5,48
Bucha de redução galvanizado 1/2"×1/4"	7,82
Te galvanizado de redução 1×1/2"	29,66
Broca Plus sds 06×160mm	9,3
Broca Plus sds 10×160mm	11,84
Luva pra mão pu tátil forr smart PT G	5,24
Luva pra mão pu tátil forr smart PT P	5,24
Te ranhurado mecanico sprink 2×3/4"	33,96
Óculos leopardo incolor	5,66
Registro esfera metal alavancar 1"	48,36
Niple duplo galvanizado 1/4"	11
Denverpoxi 1kg	79,74
Disjuntor monofásico 25A 3KA -curva B	12,76
Válvula de retenção Horizontal 3" docol	1148,6
Clips conector U pra cabo de aço (D) 5/16-8,0mm	1,42
Válvula de retenção vertical 2.1/2"	539,7
Adesivo epoxi profissional 1.8kg (araldite) brascola	428,94
Niple galvanizado de 2.1/2" polegadas	47,02
Cotovelo galvanizado de 90º 3" podegadas segurimax	117,42
Te galvanizado 3"polegadas	156,66
Bucha de redução galvanizado 3×2.1/2"	56,44
União galvanizado 3" polegadas ass.plano	232,84
Registro gaveta bruto 2.1/2" polegadas	391,68
Abrigo, caixa para Mangueira 90x60x17 Embutir	527,14
ACIONADOR MANUAL CONVENCIONAL COM SIRENE , SEGURIMAX	88,78
BASE MASTRO 1.1/2" POLEGADAS,ACO ELET	81,08
CABO FLEXIVEL 4,0MM VERMELHO 750V	671,08
TAMPAO FERRO 60X60 SIMPLES	566,12
TAMPAO FERRO T-16 LISO 30X30	119,02
TAMPAO FERRO T-16 TEL 25X25	87,92
CANALETA 20X10X2000MM BR S/DIV COM FITA	9,34
TAMPAO CEGO COM/CORRENTE 1.1/2" ALUM	72,78
CONTATOR 3TS31 12A 220V 1NA	212,06
CORDOALHA 50MM COBREADA NORMATIZADA	48,12
CORDOALHA 16MM COBRE NU	27
CORDOALHA 16MM COBREADA NORMATIZADA	16,44
COTOVELO GALVANIZADO 1" 90	20,74
COTOVELO GALVANIZADO 2.1/2" 90	107,66
COTOVELO GALVANIZADO 45, 3" POLEGADA	191,82
COTOVELO GALVANIZADO 45 3/4"	14,84
COTOVELO GALVANIZADO 4" ,90	321,82
COTOVELO GALVANIZADO,1.1/4" ,90	30,54
COTOVELO GALVANIZADO 1.1/2" ,45	44,02
CURVA GALV ZINCADO 90, 3/4"	6,5
ESGUICHO 1.1/2" JATO REGUL 3 POS ALUM	167,38
CAPTOR FRANKLIN COM,1 DECIDA 300MM LATAO 3/4	222,94
CENTRAL DE INCENDIO 80 LACOS 24V COMPACT SUGURIMAX	2367,48
CENTRAL INCENDIO 24 LACOS 24V CONVENCIONAL SEGURIMAX	1318,78
CHAVE DUPL PRA CONEXOES 1.1/2X2.1/2" LATAO	31,32
ADAPTADOR PRA ESGUICHO 2.1/2X2.1/2" ALUMINIO	52,86
ESTICADOR PRA CABO DE ACO 3/4-20MM	94,06
ESTICADOR PRA CABO DE ACO 3/16-5MM	5,9
ESTICADOR PRA CABO DE ACO 5/8-16MM	32,84
ESTICADOR PRA CABO DE ACO 5/16-08MM	7,58
ESTICADOR PRA CABO DE ACO 1/2-12MM	19,62
FITA ANTI DERRAPANTE 50MMX05MT PRETO	50,02
CABO PP 4X25MM 1KV HEPR MT	206,78
CABO PP 4X25MM 1KV HEPR METRO	44,98
CABO PP 4X 1,5MM 500V	13,76
CABO PP 3X 2,5MM 1KV HEPR MT	15,76
CABO PP 3X 6,0MM 1KV HEPR MT	38,78
FITA ISOLANTE 18MMX10MT CZ	4,68
FITA ISOLANTE AUTOFUSAO 05MT PT23	35,98
FITA ISOLANTE 19MMX10METRO AZUL	3,94
FITA ISOLANTE 19MMX10MT VERMELHO	3,58
FITA ISOLANTE 19MMX10MT AMARELO	3,6
FITA DUPLA FACE ACR 19MMX20MT FITA FORTE 080	59,58
FITA DUPLA FACE ACR 12MMX20MT FITA FORTE	40,96
FITA ZEBRADA 70MMX200M PT/AM	17,58
FITA DEMARCACAO SOLO 50MMX30MT VERMELHO	49,28
FITA VEDA ROSCA 18MMX25 METRO	3,44
ADAPTADOR AA FLANGE+ANEL CAIXA DAGUA 60MM 2"	66,32
AGUA RAZ 5LT	111,34
ABRAÇADEIRA TIPO D COM CUNHA 3/4"	1,22
TINTA SPRAY U.G VERMELHO 250ML 120GR	20
TINTA SPRAY U.G BRANCO FO 250ML 120GR	18,2
TINTA SPRAY U.G GRAFITE 250ML 120GR	18,46
ISOLADOR REF CHAPA ENCOSTO ACO ELET	20,76
ISOLADOR REF 1 DC MASTRO 1.1/2" ACO ELET	27,42
ISOLADOR SIMP 2 DECIDA MASTRO 2" ACO ELET	36,9
HASTE P/ATERRAMENTO 5/8" 3,00M	72,26
JOELHO PVC SOLDAVEL 45 50MM	9,64
BLOCO DE EMERGENCIA LED 400 LUMENS	263,48
BLOCO DE EMERGENCIA LED 300 LUMENS	252,36
BLOCO DE EMERGENCIA LED 1200 LUMENS	276,5
BLOCO DE EMERGENCIA LED 200 LUMENS	144,3
BLOCO DE EMERGENCIA LED 3000 LUMENS	931,62
BUCHA FIXACAO PLAST S08 COM,1000 COM ANEL	44,22
BUCHA FIXACAO PLAST S06 COM,1000 COM ANEL	27,62
BUCHA FIXACAO PLAST S05 COM 1000 COM ANEL	29,94
BUCHA FIXACAO PLAST S08 COM 1000 SEM ANEL	37,6
BUCHA FIXACAO PLAST S10 COM/500 CCOM/ANEL	42,82
MAO FRANCESA 30CM PRATA	22,32
MASTRO SIMPLES 3M 2" ACO GALV	473,64
NIPLE DUPLO GALV 1"	15,34
NIPLE DUPLO GALV 2.1/2"	68,92
NIPLE DUPLO GALV 2"	44,1
CHUMBADOR CBA 3/8X3.1/2" COM PARAFUSO	5,62
CAIXA PROTECAO GERAL CEB	828,38
BUCHA DE RED GALVANIZADO 4X2.1/2"	156,62
COTOVELO RANHURADO 45 2.1/2" 76MM	100,32
COTOVELO RANHURADO 90 2.1/2" 73MM	91,96
TE RANHURADO 2.1/2" 73MM	143,84
ACOPLAMENTO RANHURADO RIGIDO 2.1/2" 73MM	68
TE RANHURADO MECANICO 4X2.1/2" 73MM	152,36
TIMER DIGITAL P/TRILHO DIN 35MM	162,58
SELANTE PU PRETO 400GR PU40	20,46
TE GALVANIZADO 90 1.1/4"	40,66
BOTINHA TERMINAL DE PRESSAO 16MM	9,08
TUBO GALV C/COST BS LEV 6M 5580 1/2"	195,16
TUBO GALVANIZADO C/COST BS LEV 6M 5580 2.1/2"	942,72
UNIDUT RETO CONECTOR LUVA 3/4"	5,62
Placas de Sinalização	10
TAMPAO GALVANIZADO C/SEXTAVADO 2.1/2"	73,72
TAMPAO GALV C/SEXTAVADO 1"	12,52
TAMPAO GALV C/SEXTAVADO 2"	35,54
TAMPAO GALV C/SEXTAVADO 3/4"	8,82
TE GALVANIZADO 45 3"	696,56
TE RANHURADO 1"	47,26
TE RANHURADO 3"	174,98
TE RANHURADO 2"	103,7
TE RANHURADO MECANICO 4X3"	188,56
TE RANHURADO 1.1/4"	68,46
TE RANHURADO MECANICO 2X1.1/2"	69,22
TE RANHURADO MECANICO SPRINK 2X1" NPT	40,28
TE RANHURADO MECANICO SPRINK 2.1/2X1" NPT	47,74
TAMPAO RANHURADO 3"	35,74
TAMPAO RANHURADO 2.1/2"	29,4
ACOPLAMENTO RANHURADO RIGIDO 2" 1/36	54,96
ACOPLAMENTO RANHURADO RIGIDO 2.1/2" 76MM	69,06
ACOPLAMENTO RANHURADO RIGIDO 3"	83,78
COTOVELO RANHURADO 90 3"	114,48
COTOVELO RANHURADO 90 2"	65,1
COTOVELO RANHURADO 45 2.1/2" 73MM	91,04
TE RANHURADO MECANICO  4X3"	188,56
TE RANHURADO MECANICO  2X1.1/4" 60X42MM	84,6
TE RANHURADO MEC 2X1.1/4" 60X42MM	84,6
BUJAO GALVANIZADO 2''	25,6
BUJAO GALVANIZADO 3''	72,54
ABRAÇADEIRA TIPO GOTA 3/4	1,18
ABRAÇADEIRA TIPO COPO 3/4	3,8
BUCHA DE REDUÇAO 2.1/2X2''	58,64
BUCHA DE REDUÇAO 3X2.1/2''	81,84
MANOMETRO DN63 S VERT CAIXA INOX C-GLIC BSP 1-4 0A 10BAR	200
Lampada de emergência	40
Infra Hidrante Galvanizado em metro	2000
Infra alarme zincado em metro	2000
Infra Sprinkler Galvanizado em metro	2000
Infra Luminária, Lampada em metro	2000
silicone acético preto 250ml	19,3
ADAPTADOR PRENSA CABO 1/2''	6,72
LUK SINALEIRO LED VD AD16 22A 220V	17,7
Botão comutador 2 estágio luk, quadro de comando.	33,64
ESPUMA EXPANSIVA PU 500ML	23,96
NIPLE GALVANIZADO 3''	92,92
COTOVELO GALVANIZADO 3''	163,64
REGISTRO BRUTO DE GAVETA 3''	748,08
REGISTRO BRUTO DE GAVETA 3/4''	65,62
TOMADA EM BARRA 2PXT 10A PRETA	20,56
TINTA SPRAY USO GERAL PRETO FOSCO 400ML	23,38
TINTA SPRAY USO GERAL BRANCO FOSCO 400ML	22,58
TE GALVANIZADO 2.1/2	116,96
TE GALVANIZADO 2.1/2''	166,1
CONTATOR 3TS 33-11-220V 025A 0AN2	252,62
DISJUNTOR N UNIPOLAR.C 010A 3,0KA 5SL1110-7MB	21,44
TERMINAL PRE ISOLADO TP23-6 OLHAL AM 100	165,3
CONECTOR SAK 0O4.00 WDU BG	5,1
CNX POSTE PLASTICO WEW35/2	6,44`;

        const productsToSeed = rawData.trim().split('\n').map(line => {
            // Find the last tab or space sequence that precedes the price
            // Since some names have spaces, and prices are like "1.200,00" or "200"
            // We'll regex match the price at the end.
            const match = line.match(/(.+?)\s+([\d.,]+)$/);
            if (match) {
                const name = match[1].trim();
                const priceStr = match[2].replace(/\./g, '').replace(',', '.'); // Fix currency format
                return {
                    name,
                    category: 'Material',
                    unit: 'un',
                    price: parseFloat(priceStr) || 0,
                    user_id: user?.id
                };
            }
            return null;
        }).filter(p => p !== null) as any[];

        // Insert in batches of 50 to avoid timeouts
        const batchSize = 50;
        let errorCount = 0;
        let lastError: any = null;

        for (let i = 0; i < productsToSeed.length; i += batchSize) {
            const batch = productsToSeed.slice(i, i + batchSize);
            const { error } = await supabase.from('product_catalog').insert(batch);
            if (error) {
                console.error('Error seeding batch:', error);
                errorCount++;
                lastError = error;
            }
        }

        if (errorCount > 0) {
            alert(`Erro ao criar produtos. Falha em ${errorCount} lotes. Detalhes: ${lastError?.message || JSON.stringify(lastError)}`);
        } else {
            alert('Produtos importados com sucesso!');
            fetchProducts();
        }
        setLoading(false);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.storage_location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.observation || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Catálogo de Produtos"
                subtitle="Gerencie os itens, preços e unidades disponíveis para os orçamentos."
                breadcrumbs={
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-text-muted">Home</span>
                        <span className="material-symbols-outlined text-text-muted text-[14px]">chevron_right</span>
                        <span className="text-primary font-semibold">Catálogo</span>
                    </div>
                }
                actions={
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Novo Produto
                    </button>
                }
            />

            <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                <div className="max-w-7xl mx-auto flex flex-col gap-6">
                    {/* Search */}
                    <div className="bg-surface-dark p-4 rounded-xl border border-white/5 shadow-sm flex gap-4">
                        <div className="relative flex-1">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-500">search</span>
                            <input
                                type="text"
                                placeholder="Buscar produtos..."
                                className="w-full bg-background-dark border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-surface-dark rounded-xl border border-white/5 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white/5 text-slate-400 font-medium uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Ações</th>
                                        <th className="px-6 py-4">Nome do Produto</th>
                                        <th className="px-6 py-4 text-center">Placa?</th>
                                        <th className="px-6 py-4">Categoria</th>
                                        <th className="px-6 py-4">Fornecedor</th>
                                        <th className="px-6 py-4 text-center">Unidade</th>
                                        <th className="px-6 py-4 text-right">Preço Unit.</th>
                                        <th className="px-6 py-4 text-right">Preço Custo</th>
                                        <th className="px-6 py-4">Cadastro</th>
                                        <th className="px-6 py-4">Localização (Depósito)</th>
                                        <th className="px-6 py-4">Observação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        <tr><td colSpan={11} className="px-6 py-8 text-center text-slate-500">Carregando catálogo...</td></tr>
                                    ) : filteredProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="px-6 py-12 text-center text-slate-500">
                                                <div className="flex flex-col items-center gap-4">
                                                    <p>Nenhum produto encontrado.</p>
                                                    <button
                                                        onClick={handleSeedProducts}
                                                        className="text-primary hover:text-primary-light text-sm font-medium hover:underline"
                                                    >
                                                        Carregar produtos padrão de Incêndio/Sprinklers
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredProducts.map(product => (
                                            <tr key={product.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => setSelectedProductForDetails(product)}
                                                            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                            title="Ver Detalhes"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenModal(product)}
                                                            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(product.id)}
                                                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                            title="Excluir"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-white">{product.name}</td>
                                                <td className="px-6 py-4 text-center">
                                                    {product.is_signage ? (
                                                        <span className="material-symbols-outlined text-amber-500 text-[18px]" title="Identificado como Placa">warning</span>
                                                    ) : (
                                                        <span className="text-slate-600">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-slate-400">
                                                    <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-xs">
                                                        {product.category || 'Material'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-400 text-sm">
                                                    {suppliers.find(s => s.id === product.supplier_id)?.name || '-'}
                                                </td>
                                                <td className="px-6 py-4 text-center text-slate-400">{product.unit || 'un'}</td>
                                                <td className="px-6 py-4 text-right font-medium text-emerald-400">
                                                    R$ {product.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-400">
                                                    R$ {Number(product.cost_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-slate-400 text-sm">
                                                    {product.registration_date ? new Date(product.registration_date).toLocaleDateString('pt-BR') : '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {product.storage_location ? (
                                                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider">{product.storage_location}</span>
                                                    ) : (
                                                        <span className="text-slate-600">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-text-muted truncate max-w-[150px]" title={product.observation}>
                                                    {product.observation || '-'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="w-full max-w-md bg-surface-dark border border-white/10 rounded-xl shadow-2xl p-6 my-auto max-h-[95vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="flex flex-col gap-4">
                            <div className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl border border-white/10 mb-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase">Imagem do Produto</label>
                                <div className="relative group cursor-pointer w-24 h-24 bg-black/40 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden hover:border-primary/50 transition-all">
                                    {formData.image ? (
                                        <>
                                            <img src={formData.image} className="w-full h-full object-contain" />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="material-symbols-outlined text-white">edit</span>
                                            </div>
                                        </>
                                    ) : (
                                        <span className="material-symbols-outlined text-slate-700 text-3xl">add_a_photo</span>
                                    )}
                                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} />
                                </div>
                                {formData.image && (
                                    <button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="text-[10px] text-rose-500 font-bold hover:underline">Remover foto</button>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Nome</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Localização no Depósito</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Prateleira A-12, Corredor 3"
                                    className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none"
                                    value={formData.storage_location}
                                    onChange={e => setFormData({ ...formData, storage_location: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Fornecedor</label>
                                <select
                                    className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none"
                                    value={formData.supplier_id}
                                    onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}
                                >
                                    <option value="">Selecione...</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Categoria</label>
                                    <select
                                        className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none"
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    >
                                        <option value="Material">Material</option>
                                        <option value="Serviço">Serviço</option>
                                        <option value="Equipamento">Equipamento</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Unidade</label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={5}
                                        placeholder="ex: m, un, kg"
                                        className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none"
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Preço Venda (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none font-medium"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Preço Custo (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none font-medium"
                                        value={formData.cost_price}
                                        onChange={e => setFormData({ ...formData, cost_price: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10">
                                <input
                                    type="checkbox"
                                    id="is_signage"
                                    className="w-5 h-5 rounded border-white/20 bg-black/40 text-primary focus:ring-primary cursor-pointer accent-primary"
                                    checked={formData.is_signage}
                                    onChange={e => setFormData({ ...formData, is_signage: e.target.checked })}
                                />
                                <label htmlFor="is_signage" className="text-sm font-medium text-white cursor-pointer select-none">
                                    Este produto é uma Placa/Sinalização
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Data de Cadastro</label>
                                <input
                                    type="date"
                                    className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none"
                                    value={formData.registration_date}
                                    onChange={e => setFormData({ ...formData, registration_date: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Observação</label>
                                <textarea
                                    className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-primary outline-none resize-none h-20"
                                    value={formData.observation}
                                    onChange={e => setFormData({ ...formData, observation: e.target.value })}
                                ></textarea>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 transition-colors font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg shadow-lg shadow-primary/20 transition-colors font-bold"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            )}

            {/* Modal de Detalhes */}
            {selectedProductForDetails && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4 overflow-y-auto">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl p-0 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 my-auto max-h-[95vh] overflow-y-auto custom-scrollbar">
                        <div className="relative h-48 bg-white/5 flex items-center justify-center p-8 border-b border-white/10">
                            {selectedProductForDetails.image ? (
                                <img src={selectedProductForDetails.image} alt={selectedProductForDetails.name} className="h-full object-contain" />
                            ) : (
                                <span className="material-symbols-outlined text-7xl text-slate-700">inventory_2</span>
                            )}
                            <button
                                onClick={() => setSelectedProductForDetails(null)}
                                className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-8">
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-1">{selectedProductForDetails.name}</h2>
                                    <div className="flex gap-2 items-center">
                                        <span className="bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">{selectedProductForDetails.category || 'Material'}</span>
                                        {selectedProductForDetails.is_signage && (
                                            <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-black uppercase">Sinalização</span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Preço Sugerido</p>
                                    <p className="text-2xl font-black text-emerald-400">R$ {selectedProductForDetails.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-8">
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Localização no Depósito</p>
                                    <p className="text-white font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
                                        {selectedProductForDetails.storage_location || <span className="text-slate-600 font-normal italic">Não informada</span>}
                                    </p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Unidade de Medida</p>
                                    <p className="text-white font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-emerald-500">straighten</span>
                                        {selectedProductForDetails.unit || 'un'}
                                    </p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Fornecedor Preferencial</p>
                                    <p className="text-white font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-amber-500">local_shipping</span>
                                        {suppliers.find(s => s.id === selectedProductForDetails.supplier_id)?.name || <span className="text-slate-600 font-normal italic">Nenhum</span>}
                                    </p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Data de Cadastro</p>
                                    <p className="text-white font-medium flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-slate-400">calendar_today</span>
                                        {selectedProductForDetails.registration_date ? new Date(selectedProductForDetails.registration_date).toLocaleDateString('pt-BR') : '-'}
                                    </p>
                                </div>
                            </div>

                            <div className="mb-8">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Observações Adicionais</p>
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5 min-h-[80px]">
                                    <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
                                        {selectedProductForDetails.observation || <span className="italic opacity-50 text-xs">Sem observações.</span>}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => {
                                        setSelectedProductForDetails(null);
                                        handleOpenModal(selectedProductForDetails);
                                    }}
                                    className="flex-1 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20"
                                >
                                    <span className="material-symbols-outlined">edit</span>
                                    Editar Informações
                                </button>
                                <button
                                    onClick={() => setSelectedProductForDetails(null)}
                                    className="px-8 py-3 border border-white/10 hover:bg-white/5 text-slate-300 rounded-xl font-bold transition-all"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default ProductsView;
