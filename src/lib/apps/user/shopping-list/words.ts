/** Most common first: a tie in `snap_word` goes to the earlier word. */
const WORDS = `
mleko mleka jajca jajce kruh kruha maslo masla moka moke sladkor sol olje olja riž riža testenine špageti jogurt
jogurti jogurta smetana smetane sir sira siri skuta kefir margarina sadje zelenjava meso mesa piščanec piščančje puran
puranje govedina govejo svinjina svinjsko mleto zrezki klobase klobasa hrenovke šunka salama pršut slanina pašteta
tuna losos riba ribe sardine kozice lignji čevapčiči jabolka jabolko hruške banane banana pomaranče mandarine limone
limona limeta limete grozdje jagode borovnice maline češnje breskve marelice slive kivi ananas mango avokado lubenica
melona fige datlji rozine krompir čebula česen korenje korenček paradižnik paprika paprike kumare kumarice solata
zelje repa brokoli cvetača bučke buča jajčevci špinača blitva por zelena peteršilj drobnjak bazilika rukola motovilec
radič gobe šampinjoni koruza fižol čičerika leča grah stročji redkvice pesa ingver čili poper cimet vegeta origano
timijan rožmarin kurkuma kari muškat klinčki lovor majaron sezam mak orehi lešniki mandlji arašidi pinjole semena chia
sončnična bučna olivno kis balzamični gorčica majoneza mayo ketchup kečap omaka omake sojina sriracha pesto
paradižnikova pasirani koncentrat juha juhe jušne kocke kvas pecilni prašek vanilijev vanilin med marmelada džem
nutella čokolada kakav kava čaj čaji voda mineralna sok soki sirup pivo vino limonada radenska cola kokakola tonik
čips keksi piškoti krekerji napolitanke bonboni žvečilni žvečilke smoki kokice tartufi sladoled puding pudingi
drobtine zdrob polenta ajdova koruzna pirina ovseni ovsena kosmiči musli granola kuskus kvinoja ješprenj proso rezanci
makaroni lazanja njoki tortilje bageta žemlje žemljice štručka rogljički toast mozzarella parmezan feta mascarpone
rikota kajmak pinjenec sladka kisla tekoča trda mehka polnozrnat polnozrnati beli bela črni črna rdeča rdeči rumena
zelene sveže sveži zamrznjen zamrznjena konzerva konzerve pločevinka steklenica paket vrečka vrečke vrečk smeti
zamrzovanje folija alu peki papir papirja papirnate papirnati brisače toaletni robčki robci prtički serviete
detergent pralni mehčalec tablete pomivalni pomivalno sredstvo gobice krpe čistilo čistila belilo varekina rokavice
baterije žarnica žarnice sveče vžigalice kartuše kartuša toner kuli kemični svinčnik lepilo selotejp lepilni trak
škarje zvezek ovojnice šampon šamponi balzam gel tuš milo mila zobna pasta ščetka ščetke nitka deodorant dezodorant
krema kreme losjon britvice vložki tamponi plenice palčke ušesa vatirane blazinice vitamini vitamin omega magnezij
aspirin obliži hrana mačke psa pesek žganje sendvič pica pizza burek milk eggs bread butter cheese yogurt cream flour
sugar salt pepper rice spaghetti oil olive vinegar honey jam coffee tea juice water beer wine apples bananas oranges
lemons limes grapes strawberries blueberries tomatoes potatoes onions garlic carrots cucumber lettuce spinach broccoli
peppers mushrooms zucchini corn peas beans lentils chickpeas chicken beef pork bacon ham sausages fish salmon shrimp
cereal oats cookies biscuits crackers chips chocolate nuts almonds peanuts walnuts sauce mustard mayonnaise soap
shampoo conditioner toothpaste toothbrush softener sponges napkins tissues toilet paper towels foil bags batteries
bulbs candles cinnamon sesame vegetables fruit meat baking soda powder yeast cotton swabs buds razors lotion vitamins
diapers wipes frozen noodles tortillas avocado ginger parsley basil herbs spices ice snacks kumina koriander kardamom
šetraj melisa kamilica meta kaša kokos kokosovo ribez brusnice rabarbara šalotka beluši šparglji školjke skuše postrv
orada brancin oslič tofu humus namaz kapre inčuni kroasani krofi pecivo torta prepečenec sladilo kapsule filter
zobotrebci za in na po brez ali and with
`;

export const GROCERY_WORDS: readonly string[] = WORDS.split(/\s+/).filter(Boolean);
