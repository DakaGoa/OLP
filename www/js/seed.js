/* Old London Pub - seed content.
   Single source of truth for both the browser store and the Node API.
   Dates are generated relative to "today" so the calendar is always live. */
(function (root) {
  'use strict';

  function iso(offset) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function ev(o) {
    return Object.assign({
      id: 'ev_' + o.date + '_' + o.category,
      endTime: '',
      price: 'Free entry', priceSr: 'Ulaz slobodan',
      image: 'assets/img/hero.jpg',
      featured: false,
      recurring: null,
      titleSr: '', descriptionSr: '',
      description: 'Join us at the bar for a proper night out. Everyone welcome.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, o);
  }

  var IMG = {
    quiz: 'assets/img/quiz.jpg',
    live: 'assets/img/live.jpg',
    dj: 'assets/img/stage.jpg',
    comedy: 'assets/img/crowd.jpg',
    food: 'assets/img/food.jpg',
    special: 'assets/img/drinks.jpg'
  };

  function nextWeekday(weekday) {
    var delta = (weekday - new Date().getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return delta;
  }

  var quiz = nextWeekday(2);
  var comedy = nextWeekday(4);
  var live = nextWeekday(5);
  var dj = nextWeekday(6);
  var roast = nextWeekday(0);

  var events = [
    ev({
      date: iso(quiz), time: '20:00', category: 'quiz',
      title: 'The Big Tuesday Quiz', titleSr: 'Veliki kviz utorkom',
      description: 'Six rounds of properly tricky questions, a few silly ones, and a bar tab for the winning team. Teams of up to six - grab a table early, it fills up.',
      descriptionSr: 'Šest rundi zaista teških pitanja, poneko šaljivo i račun za šank za pobedničku ekipu. Ekipa do šest ljudi — dođi ranije, brzo se popuni.',
      image: IMG.quiz, featured: true, recurring: 'weekly'
    }),
    ev({
      date: iso(quiz + 7), time: '20:00', category: 'quiz',
      title: 'The Big Tuesday Quiz', titleSr: 'Veliki kviz utorkom',
      description: 'Our weekly quiz is back. New questions every week, same friendly rivalry. Teams of up to six.',
      descriptionSr: 'Naš nedeljni kviz je tu. Nova pitanja svake nedelje, isto prijateljsko rivalstvo. Ekipa do šest ljudi.',
      image: IMG.quiz, recurring: 'weekly'
    }),
    ev({
      date: iso(quiz + 14), time: '20:00', category: 'quiz',
      title: 'The Big Tuesday Quiz', titleSr: 'Veliki kviz utorkom',
      description: 'Six rounds, a rolling jackpot and a bar tab for the winners. Free to play.',
      descriptionSr: 'Šest rundi, rastući džekpot i račun za šank za pobednike. Učešće je besplatno.',
      image: IMG.quiz, recurring: 'weekly'
    }),
    ev({
      date: iso(live), time: '21:00', category: 'live',
      title: 'Live Music Friday', titleSr: 'Muzika uživo petkom',
      description: 'Local bands take over the back room every Friday. This week: a three-piece playing soul, funk and everything in between. Kitchen open until 22:00.',
      descriptionSr: 'Lokalni bendovi preuzimaju zadnju salu svakog petka. Ove nedelje: trio svira soul, funk i sve između. Kuhinja radi do 22:00.',
      price: 'Free before 21:00', priceSr: 'Slobodan ulaz do 21:00',
      image: IMG.live, featured: true, recurring: 'weekly'
    }),
    ev({
      date: iso(live + 7), time: '21:00', category: 'live',
      title: 'Acoustic Sessions', titleSr: 'Akustične večeri',
      description: 'Stripped-back sets from singer-songwriters on our little stage. A quieter one, but a good one.',
      descriptionSr: 'Ogoljeni nastupi kantautora na našoj maloj bini. Mirnije veče, ali odlično.',
      image: IMG.live, recurring: 'weekly'
    }),
    ev({
      date: iso(dj), time: '22:00', category: 'dj',
      title: 'Saturday Night DJ Set', titleSr: 'DJ set subotom uveče',
      description: 'Late licence, disco ball on, and a DJ who knows exactly what to play. Last orders at 00:30.',
      descriptionSr: 'Produženo radno vreme, disko kugla se vrti i DJ koji tačno zna šta treba pustiti. Poslednja narudžbina u 00:30.',
      image: IMG.dj, recurring: 'weekly'
    }),
    ev({
      date: iso(roast), time: '13:00', category: 'food',
      title: 'Sunday Roast & Board Games', titleSr: 'Nedeljno pečenje i društvene igre',
      description: 'Proper roast, all the trimmings, and a shelf of board games for whoever fancies staying. Book a table for groups of four or more.',
      descriptionSr: 'Pravo pečenje sa svim prilozima i polica društvenih igara za sve koji žele da ostanu duže. Rezerviši sto za četvoro ili više.',
      price: 'From 1,800 RSD', priceSr: 'Od 1.800 RSD',
      image: IMG.food, recurring: 'weekly'
    }),
    ev({
      date: iso(comedy), time: '20:00', category: 'comedy',
      title: 'Comedy & a Pint', titleSr: 'Komedija i pivo',
      description: 'A mixed bill of stand-ups trying out new material in the back room. Cheap, chaotic and usually very funny.',
      descriptionSr: 'Nekoliko komičara isprobava novi materijal u zadnjoj sali. Jeftino, haotično i obično veoma smešno.',
      price: '500 RSD at the door', priceSr: '500 RSD na ulazu',
      image: IMG.comedy, recurring: 'weekly'
    }),
    ev({
      date: iso(5), time: '19:30', category: 'special',
      title: 'Cocktail Masterclass', titleSr: 'Koktel masterklas',
      description: 'Two hours with our head bartender: shake, stir and drink three classics. Limited to 12 places, booking essential.',
      descriptionSr: 'Dva sata sa našim glavnim barmenom: mućkaj, mešaj i popij tri klasika. Samo 12 mesta, obavezna rezervacija.',
      price: '2,900 RSD per person', priceSr: '2.900 RSD po osobi',
      image: IMG.special, featured: true
    }),
    ev({
      date: iso(11), time: '20:30', category: 'live',
      title: 'Battle of the Bands: Heat One', titleSr: 'Bitka bendova: prva runda',
      description: 'Four local bands, one slot in the final, and you decide who goes through. Doors 20:00.',
      descriptionSr: 'Četiri lokalna benda, jedno mesto u finalu i ti odlučuješ ko prolazi. Vrata se otvaraju u 20:00.',
      price: '350 RSD at the door', priceSr: '350 RSD na ulazu',
      image: IMG.live
    }),
    ev({
      date: iso(17), time: '19:00', category: 'food',
      title: 'Beer & Cheese Tasting', titleSr: 'Degustacija piva i sira',
      description: 'Five independent breweries, five cheeses, and a very opinionated host. Tickets include all tastings.',
      descriptionSr: 'Pet nezavisnih pivara, pet sireva i domaćin sa izraženim stavom. Karta uključuje sve degustacije.',
      price: '2,100 RSD per person', priceSr: '2.100 RSD po osobi',
      image: IMG.food
    }),
    ev({
      date: iso(24), time: '20:00', category: 'quiz',
      title: 'Christmas Quiz & Mulled Wine', titleSr: 'Božićni kviz i kuvano vino',
      description: 'A festive special: ten rounds, mulled wine on arrival and a proper hamper for the winners. Fancy dress encouraged.',
      descriptionSr: 'Praznični specijal: deset rundi, kuvano vino na ulazu i prava korpa za pobednike. Kostimi su poželjni.',
      price: '600 RSD per person', priceSr: '600 RSD po osobi',
      image: IMG.quiz, featured: true
    })
  ];

  var settings = {
    pubName: 'Old London Pub',
    tagline: 'Good nights start here.',
    taglineSr: 'Dobre večeri počinju ovde.',
    eyebrow: 'A proper local, all week long',
    eyebrowSr: 'Pravi lokalni pab, cele nedelje',
    about: 'A proper pub with a proper calendar. Quiz nights, live music, comedy, late DJs and a Sunday roast worth getting out of bed for. Pull up a stool, stay a while.',
    aboutSr: 'Pravi pab sa pravim kalendarom. Kvizovi, svirke uživo, komedija, kasni DJ setovi i nedeljno pečenje zbog kog vredi ustati. Sedni za šank, ostani duže.',
    address: 'Gavrila Principa 46, Belgrade, Serbia',
    hours: 'Mon–Thu 16:00–23:00 · Fri–Sat 12:00–01:00 · Sun 12:00–22:30',
    hoursSr: 'Pon–Čet 16:00–23:00 · Pet–Sub 12:00–01:00 · Ned 12:00–22:30',
    instagram: 'https://www.instagram.com/old_london_pub/',
    email: 'hello@olp.example',
    phone: '+381 11 000 0000'
  };

  var SEED = {
    events: events,
    settings: settings,
    admin: {
      username: 'OLP',
      name: 'OLP Admin',
      salt: 's_local',
      hash: 'b76e84339974eb1f6032e281dd60f643be6a404c989ef40f77b17ae82b298a5f'
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SEED;
  root.OLP_SEED = SEED;
})(typeof globalThis !== 'undefined' ? globalThis : this);
