# Séismes EMSC

Les séismes proches de chez vous dans Gladys, en direct, tels que les signale
l'[EMSC-CSEM](https://www.emsc-csem.org) (Centre sismologique euro-méditerranéen) : magnitude, distance,
profondeur, heure et région du dernier, et leur nombre sur les dernières 24 heures. Pensée pour les
séismes que l'on peut **ressentir** chez soi : Pyrénées, Alpes, Provence, Italie, Grèce, Antilles… Pas
de compte, pas de clé d'API.

L'intégration écoute le flux temps réel de l'EMSC : un séisme arrive dans Gladys quelques secondes après
sa publication par l'EMSC, en général quelques minutes après qu'il s'est produit. Ce n'est pas un
système d'alerte précoce : quand il est signalé, la secousse est passée. Non affiliée à l'EMSC.

Pour les grandes catastrophes du monde entier (classées vert, orange ou rouge), voir l'intégration GDACS.

## Ce que vous obtenez

- Un appareil **Séismes proches** : magnitude, distance, profondeur, heure et région du dernier séisme de
  votre zone, nombre de séismes sur les dernières 24 heures et plus forte magnitude sur 24 heures, avec
  leur historique.
- Un **widget de tableau de bord** qui liste les derniers séismes de votre zone (7 jours), du plus récent
  au plus ancien, chacun avec sa page EMSC (où vous pouvez signaler à l'EMSC que vous l'avez ressenti).
- Deux **déclencheurs de scène** : un nouveau séisme dans votre zone, et la magnitude d'un séisme révisée.
- Une **action de scène** qui lit les séismes des dernières 24 heures en une phrase, à envoyer par
  message ou à faire lire à voix haute.

## Prérequis

- Gladys Assistant 5.1 ou plus récent.
- Un accès à internet depuis la machine de Gladys (l'intégration lit `www.seismicportal.eu`, le portail
  de données de l'EMSC, en HTTPS et par WebSocket).
- Une position pour votre maison dans Gladys (Paramètres → Maisons), ou des coordonnées saisies dans la
  configuration.

## Configuration

### Réglages

Intégrations → Séismes EMSC → Configuration :

| Réglage                        | Défaut     | Signification                                                                              |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| Latitude / longitude du centre | vides      | Vides : la position de votre première maison localisée. Degrés décimaux, virgule ou point. |
| Rayon de la zone proche        | 200 km     | Distance du centre à l'épicentre, de 25 à 1 000 km.                                        |
| Magnitude minimale, proche     | M2,5       | Les séismes plus faibles sont ignorés. De M1 à M5.                                         |
| Rayon de la zone lointaine     | Désactivée | Facultatif : une zone plus large, de 500 à 3 000 km, pour les seuls séismes forts.         |
| Magnitude minimale, lointaine  | M5,5       | Le minimum de la zone lointaine, de M4 à M7.                                               |
| Langue des textes              | Français   | Noms des fonctionnalités (à leur création) et textes envoyés aux scènes.                   |

Enregistrez, puis créez l'appareil dans l'onglet **Découverte**.

### La zone suivie

Un séisme est dans votre zone s'il est dans le rayon de la zone proche **et** d'au moins sa magnitude
minimale, ou, quand la zone lointaine est activée, dans le rayon de la zone lointaine **et** d'au moins
sa propre magnitude minimale. La zone lointaine ne compte que si son rayon et sa magnitude dépassent tous
deux ceux de la zone proche : sinon l'écran de configuration indique qu'elle est ignorée.

Ordre de grandeur : un séisme de magnitude 2,5 ne se ressent qu'auprès de l'épicentre, de magnitude 3
jusqu'à quelques dizaines de kilomètres, de magnitude 4 jusqu'à une centaine, de magnitude 5 jusqu'à
quelques centaines. Dans une région active (Grèce, Italie, Turquie), l'EMSC liste plusieurs séismes de
magnitude 2 par jour : gardez-y un minimum de 2,5 ou 3.

Un réglage type pour la métropole : 200 km et M2,5 en zone proche, 1 000 km et M5 en zone lointaine (un
fort séisme en Italie, en Espagne ou en Allemagne).

Changer de zone (centre, rayon, magnitude) la reprend de zéro : les séismes qui s'y trouvent déjà sont
chargés sans déclencher de scène.

## Appareil

| Fonctionnalité                | Type     | Valeur                                                                       |
| ----------------------------- | -------- | ---------------------------------------------------------------------------- |
| Magnitude du dernier séisme   | Sismique | Magnitude du dernier séisme de la zone, telle que l'EMSC l'évalue.           |
| Distance du dernier séisme    | Distance | Distance du centre à son épicentre, en km.                                   |
| Profondeur du dernier séisme  | Distance | Profondeur de son foyer, en km.                                              |
| Heure du dernier séisme       | Texte    | Sa date et son heure, dans le fuseau horaire de Gladys.                      |
| Région du dernier séisme      | Texte    | Sa région, nommée par l'EMSC (en anglais, par exemple « Western Pyrenees »). |
| Séismes sur 24 h              | Compteur | Nombre de séismes de la zone sur les dernières 24 heures.                    |
| Plus forte magnitude sur 24 h | Sismique | La plus forte magnitude des dernières 24 heures, 0 s'il n'y en a eu aucun.   |

Le dernier séisme reste affiché, quel que soit son âge. Les valeurs sur 24 heures suivent l'horloge :
elles baissent quand un séisme a plus de 24 heures.

## Widget de tableau de bord

**Séismes proches** : un titre avec le nombre de séismes sur 24 heures, puis les derniers séismes de la
zone sur 7 jours (8 au plus), du plus récent au plus ancien : région, distance et heure, et la magnitude
en pastille (bleue, orange à partir de la magnitude 4, rouge à partir de 5). Touchez une ligne pour le
détail (type de magnitude, profondeur, organisme qui l'a signalé, zone) et le lien vers sa page EMSC. Le
pied du widget donne la source et l'heure de la dernière mise à jour.

## Déclencheurs de scène

**EMSC : nouveau séisme dans ma zone** : un séisme de votre zone de moins d'une heure, dès que l'EMSC le
publie. Un séisme signalé plus tard (c'est rare), ou déjà là quand la zone a été réglée, ne déclenche
rien. Filtre : **Zone** (proche, lointaine).

**EMSC : magnitude révisée** : l'EMSC révise de 0,5 ou plus la magnitude d'un séisme de votre zone des
dernières 24 heures (la première magnitude est souvent une estimation automatique). Même filtre.
Variable en plus : magnitude précédente.

Variables des deux : zone (`near` ou `far`) et zone en toutes lettres, magnitude, type de magnitude
(`ml`, `mb`, `mw`…), distance (km), profondeur (km), région, date et heure, résumé (par exemple « M3,2
Western Pyrenees, à 45 km, 16/10 15:17 »), page EMSC. Une condition sur une variable (magnitude
supérieure à 4, distance inférieure à 50 km) peut suivre le déclencheur dans la scène.

## Action de scène

**EMSC : lire les séismes récents** donne :

- **Séismes, en une phrase** : par exemple « 2 séismes en 24 heures : M2,7 Aegean Sea, à 167 km, 16/10
  06:31 ; M2,5 Greece, à 83 km, 16/10 05:58. », ou le dernier connu s'il n'y en a eu aucun ;
- **Séismes sur 24 heures** et **Plus forte magnitude sur 24 heures**, en nombres.

L'action de configuration **Afficher les derniers séismes** montre la même phrase (trois séismes au
plus).

## Exemples de scènes

- **Vous l'avez senti ?** Déclencheur « nouveau séisme dans ma zone », zone proche, puis une condition
  « magnitude ≥ 3 » : envoyer « Séisme {résumé}. Signalez-le à l'EMSC si vous l'avez ressenti : {page} »
  par message.
- **Fort séisme au loin** : déclencheur « nouveau séisme », zone lointaine : prévenir la famille, lire le
  résumé à voix haute.
- **Point du matin** : chaque jour à 8 h, l'action « lire les séismes récents », puis envoyer sa phrase par
  message si le nombre de séismes est supérieur à 0.

## Sources de données, conditions et quotas

- Flux temps réel : `wss://www.seismicportal.eu/standing_order/websocket`, un message par séisme créé ou
  révisé dans le monde. L'intégration garde une connexion ouverte et la rouvre quand elle est perdue
  (5 secondes, puis jusqu'à 5 minutes entre deux tentatives).
- Rattrapage : le service d'événements FDSN `https://www.seismicportal.eu/fdsnws/event/1/query`, lu
  seulement au démarrage, après une coupure du flux et quand la zone change (une requête par zone, au
  plus toutes les 5 minutes, les 7 derniers jours). Le flux fait le travail : le service n'est jamais
  interrogé en boucle.
- Pas de compte, pas de quota publié. Les données sont diffusées par l'EMSC-CSEM sous licence CC BY 4.0 :
  crédit « EMSC-CSEM, https://www.emsc-csem.org » (affiché dans le widget). Conditions :
  https://www.seismicportal.eu/terms.html
- Seule la zone est envoyée à l'EMSC (centre et rayon, dans la requête de rattrapage) ; l'intégration
  conserve les séismes des 7 derniers jours sous `/data`, jamais les coordonnées de votre maison.

## Dépannage

- **« Aucun centre »** dans l'écran de configuration : indiquez la position de votre maison (Paramètres →
  Maisons), ou saisissez des coordonnées.
- **« Le flux temps réel de l'EMSC est coupé »** : la machine de Gladys n'atteint pas
  `www.seismicportal.eu` (internet, DNS, proxy, pare-feu qui bloque les WebSockets). L'intégration
  réessaie d'elle-même ; les séismes de la coupure sont rattrapés au retour.
- **Aucune valeur sur l'appareil** : le premier rattrapage n'a pas encore réussi (voir les logs), ou
  l'appareil a été créé avant le premier enregistrement de la configuration : enregistrez une fois.
- **Trop de séismes** : relevez la magnitude minimale, ou réduisez le rayon.
- Plus de détails : `LOG_LEVEL=debug` montre chaque séisme retenu ou écarté, jamais vos coordonnées.

## Limites

- Pas un système d'alerte précoce : un séisme est connu quelques minutes après. En cas d'urgence, suivez
  les consignes des autorités locales.
- La magnitude et la position sont celles que publie l'EMSC ; les premières sont souvent automatiques et
  révisées dans les minutes ou les heures qui suivent. Les organismes nationaux (le RéNaSS en France, par
  exemple) peuvent donner des valeurs un peu différentes.
- La distance est mesurée jusqu'à l'épicentre, pas jusqu'à la zone où le séisme a été ressenti.
- Une zone par Gladys (la première maison localisée, ou les coordonnées de la configuration).
- Développée et testée avec les vraies données de l'EMSC ; non affiliée à l'EMSC. Vos retours sont
  bienvenus.
