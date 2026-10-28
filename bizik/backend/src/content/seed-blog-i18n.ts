/**
 * Bilingual blog content: the French versions of the original English posts,
 * plus articles written in both languages. Each language version is its own
 * row with its own slug; `translationKey` (the English slug) links them so the
 * site can emit hreflang alternates and a language switch lands on the right
 * article.
 *
 * House rules for this file: no invented statistics, no promises the product
 * does not keep (no card funding, no fixed ruling deadline), fees described as
 * they really work (the buyer pays the escrow fee, the seller pays nothing),
 * and plain hyphens only.
 */
export interface SeedBlogPost {
  slug: string;
  lang: 'en' | 'fr';
  translationKey: string;
  title: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  category: string;
  categoryLabel: string;
  readMinutes: number;
  publishedAt: string;
  body: string;
}

export const BLOG_POSTS_I18N: SeedBlogPost[] = [
  // ------------------------------------------------------------------
  // French versions of the original posts
  // ------------------------------------------------------------------
  {
    slug: 'faux-livreur-arnaque-comment-la-reconnaitre',
    lang: 'fr',
    translationKey: 'the-fake-delivery-agent-is-back-what-to-watch-for',
    title: 'Le faux livreur est de retour - comment reconnaître l\'arnaque',
    excerpt:
      'Un troisième numéro rejoint la discussion et réclame des frais de livraison. Ce n\'est jamais un vrai livreur. Comment fonctionne l\'arnaque, les signaux d\'alerte, et comment le séquestre la supprime.',
    seoTitle: 'Arnaque au faux livreur au Cameroun : comment la reconnaître',
    seoDescription:
      'Un « livreur » vous demande des frais avant de livrer votre colis ? Voici comment fonctionne l\'arnaque au faux livreur au Cameroun et comment le paiement sous séquestre la bloque.',
    category: 'scam-alerts',
    categoryLabel: 'Alertes arnaques',
    readMinutes: 4,
    publishedAt: '2026-09-18T08:00:00',
    body: `Vous avez accepté d'acheter un article sur WhatsApp. Le vendeur est poli, le prix est correct. Puis un nouveau numéro est ajouté à la discussion, ou vous écrit directement : « Bonjour, je suis le livreur de votre colis. Merci de payer les 5 000 XAF de frais de livraison pour que nous puissions l'expédier. » Cela paraît banal. C'est pourtant l'une des arnaques les plus courantes au Cameroun, et elle revient en force.

## Comment fonctionne l'arnaque

Le « livreur » est soit le vendeur avec une deuxième puce, soit un complice. Il n'y a pas de colis. Les frais de livraison sont le but de l'opération : assez faibles pour que vous les payiez sans réfléchir, et c'est le seul argent qu'ils comptaient obtenir. Il y a parfois une deuxième étape : après les frais de livraison viennent des « frais d'assurance », des « frais de dédouanement » ou des « frais de correction d'adresse ». Chaque montant est un peu plus élevé, chacun arrive avec une raison et un sentiment d'urgence. Quand vous arrêtez de payer, les deux numéros disparaissent.

Variantes souvent signalées :

*   Une fausse page de suivi avec le logo d'un transporteur et un bouton « payer pour débloquer ».
*   Un « livreur » qui envoie la photo d'un colis avec votre nom écrit dessus.
*   Une note vocale d'une personne qui dit être au dépôt et qui « a besoin des frais dans dix minutes, sinon le colis repart ».
*   Des frais demandés par un numéro dont le nom WhatsApp est celui d'une société de transport.

## Pourquoi ça marche encore

Parce que les frais de livraison existent vraiment. Les vendeurs honnêtes utilisent des motos-taxis et les colis des agences de voyage, et cela coûte de l'argent. L'arnaque se cache dans une attente normale. Et comme le montant est faible, les victimes portent rarement plainte, donc les mêmes numéros continuent.

## Les signaux d'alerte

1.  **Une tierce personne vous demande de l'argent.** Dans une vraie transaction, vous payez le vendeur. Si quelqu'un d'autre réclame de l'argent, la transaction change de forme en cours de route : c'est le moment d'arrêter.
2.  **Des frais qui apparaissent après l'accord sur le prix.** Le coût de livraison doit faire partie du prix négocié, ou être convenu clairement avant de vous engager, jamais ajouté après.
3.  **L'urgence.** « Le colis repart dans dix minutes », c'est de la pression, pas de la logistique. Un vrai transporteur garde un colis plusieurs jours.
4.  **Un paiement vers un numéro personnel.** Une société de transport n'encaisse pas ses frais sur un numéro MoMo au hasard.
5.  **Un suivi impossible à vérifier vous-même.** Un vrai numéro de suivi fonctionne sur le site du transporteur, pas seulement sur un lien envoyé par le « livreur ».

## Si vous avez déjà payé

Signalez tout de suite la transaction à votre opérateur de mobile money : si l'argent n'a pas encore été retiré, un blocage reste possible. Faites des captures de toute la conversation, numéros compris. Signalez les deux numéros sur WhatsApp. Puis arrêtez de payer : chaque nouveau frais est de l'argent perdu, et payer une fois fait de vous une cible pour la suivante.

## Comment le séquestre supprime l'arnaque

Quand la transaction passe par Bizik, l'acheteur verse une seule fois le montant convenu, livraison comprise, sur le compte de séquestre. C'est le seul paiement qu'il fera. Personne ne peut en réclamer un deuxième, car il n'existe aucun moyen de le faire : le vendeur récupère le coût de la livraison au moment de la libération des fonds, pas auprès de vous dans une discussion parallèle.

Si un « livreur » apparaît et demande des frais, la réponse est simple : « Tout est sous séquestre. Demandez au vendeur de vous payer à la libération. » Un vrai livreur se moque de savoir qui le paie. Un faux vient de perdre le seul argent qu'il visait.

Et si le colis n'arrive vraiment jamais ? L'argent est toujours sous séquestre, l'acheteur ouvre un litige avec ses preuves et, si le colis n'a pas été livré, il est remboursé. L'arnaque exige que vous payiez avant de recevoir. Le séquestre rend cela impossible.

## Partagez avec quelqu'un qui achète en ligne

Le faux livreur piège les nouveaux acheteurs, les parents plus âgés et tous ceux qui sont pressés. Si vous connaissez quelqu'un qui achète sur WhatsApp ou Facebook Marketplace, envoyez-lui cet article. Une seule phrase à retenir : **personne d'autre que le vendeur n'est payé, et le vendeur est payé par le séquestre.**

Lisez la liste complète des [7 arnaques en ligne au Cameroun et comment le séquestre les bloque](/fr/blog/7-arnaques-en-ligne-au-cameroun-et-comment-le-sequestre-les-bloque), ou [découvrez comment fonctionne une transaction Bizik](/fr/how-it-works).`,
  },
  {
    slug: 'acheter-une-voiture-d-occasion-avant-d-envoyer-de-l-argent',
    lang: 'fr',
    translationKey: 'buying-a-used-car-do-this-before-you-send-any-money',
    title: 'Acheter une voiture d\'occasion ? Faites ceci avant d\'envoyer le moindre franc',
    excerpt:
      'Documents, numéro de châssis, mécanicien indépendant et délai d\'inspection. Comment organiser l\'achat d\'une voiture d\'occasion au Cameroun pour pouvoir encore renoncer.',
    seoTitle: 'Acheter une voiture d\'occasion au Cameroun sans se faire arnaquer',
    seoDescription:
      'Carte grise, châssis, gage, mécanicien, délai d\'inspection : la liste à suivre avant de payer une voiture d\'occasion au Cameroun, et comment payer sous séquestre.',
    category: 'buying-selling',
    categoryLabel: 'Achat et vente',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `Une voiture d'occasion est souvent le plus gros achat que l'on fait auprès d'un inconnu. C'est aussi la transaction où un prix bas fait le plus de dégâts : une voiture parfaite le jour de la visite peut cacher un moteur refait, une carte grise contestée ou un crédit encore en cours. Voici la liste à suivre avant que le moindre franc ne bouge, et comment organiser le paiement pour pouvoir encore renoncer si quelque chose ne va pas.

## Avant de vous mettre d'accord sur le prix

*   **Voyez les documents d'abord.** Carte grise au nom du vendeur, visite technique valide et assurance en cours. Si le nom sur la carte grise n'est pas celui du vendeur, demandez pourquoi et demandez que le propriétaire soit présent.
*   **Comparez les numéros.** Le numéro de châssis (VIN) inscrit sur la carte grise doit correspondre à celui gravé sur la carrosserie et sous le capot. Sinon, arrêtez-vous là.
*   **Vérifiez l'absence de gage.** Demandez clairement si la voiture a été achetée à crédit et si le prêt est soldé. Une voiture gagée peut vous être reprise.
*   **Prenez votre mécanicien, pas le sien.** Une heure de diagnostic dans un garage que vous avez choisi coûte une fraction d'une seule panne cachée. Demandez la compression, la boîte de vitesses, la suspension, et les traces d'inondation ou d'accident.
*   **Essayez-la sur de vraies routes.** Démarrage à froid, vitesse sur route, une côte, un tronçon dégradé. Écoutez plus que vous ne parlez.

## Négociez le délai d'inspection, pas seulement le prix

C'est là que la plupart des acheteurs laissent de l'argent sur la table. Tout le monde négocie le prix, presque personne ne négocie les conditions. La condition la plus précieuse dans l'achat d'une voiture d'occasion, c'est un délai d'inspection : un nombre de jours convenu après la remise des clés pendant lequel vous pouvez faire contrôler la voiture et, si elle ne correspond pas à la description, ouvrir un litige avant que le vendeur ne soit payé.

Un vendeur sûr de sa voiture acceptera un délai de trois à cinq jours sans difficulté. Un vendeur qui refuse tout délai vous dit quelque chose.

## Organisez le paiement pour que personne ne prenne le risque en premier

Le blocage classique : le vendeur ne donne ni les clés ni la carte grise avant d'avoir l'argent, l'acheteur ne paie pas avant d'avoir les clés et la carte grise. L'échange d'espèces sur un parking règle mal le problème, et un transfert mobile money le règle encore plus mal, car une fois envoyé, l'argent est parti.

Le séquestre le règle correctement. Sur Bizik, la transaction se déroule ainsi :

1.  **Créez la transaction** avec la marque, le modèle, l'année, le numéro de châssis, le prix convenu et le délai d'inspection (de 3 à 14 jours).
2.  **Financez-la.** L'acheteur verse le prix complet sur le séquestre par MTN MoMo, Orange Money ou depuis son portefeuille Bizik. Le vendeur voit l'argent bloqué et sait que l'acheteur est sérieux.
3.  **Remettez la voiture.** Clés, carte grise et véhicule changent de mains. Le vendeur indique que la livraison est faite.
4.  **Inspectez.** L'acheteur dispose des jours convenus pour faire contrôler la voiture et lancer la mutation.
5.  **Libérez.** L'acheteur valide, ou le délai se termine sans litige, et le vendeur est payé.

Si le mécanicien découvre que la boîte de vitesses est en fin de vie alors que le vendeur la disait en bon état, l'acheteur ouvre un litige avec le rapport du mécanicien. L'argent reste sous séquestre, gelé, jusqu'à ce qu'un médiateur Bizik examine les preuves des deux côtés et tranche : paiement au vendeur, remboursement de l'acheteur ou partage.

## Les gros retraits sont vérifiés par une personne

Pour les retraits importants vers le mobile money (500 000 XAF et plus), Bizik ajoute une vérification humaine avant que l'argent ne quitte la plateforme. Cela prend un peu plus de temps et retire beaucoup de risque, ce qui est exactement l'échange que vous voulez sur le plus gros achat de l'année.

## Les signaux qui doivent mettre fin à la discussion

*   Le prix est bien en dessous de toutes les annonces comparables « parce que je dois vendre vite ».
*   Le vendeur veut une avance pour « bloquer » la voiture avant que vous l'ayez vue.
*   Le vendeur ne veut vous rencontrer que la nuit, ou ailleurs que chez lui ou dans un garage.
*   La carte grise est « chez mon frère » ou « au bureau ».
*   Il refuse le séquestre, le délai d'inspection ou un mécanicien indépendant.

## Vendeurs : cela vous protège aussi

Si c'est vous qui vendez, le séquestre signifie plus de fausses captures de paiement, plus d'acheteur qui part avec la voiture pendant qu'un transfert MoMo « est encore en cours », et plus d'annulation après coup. Vous voyez l'argent réellement bloqué pour vous avant de remettre quoi que ce soit, et le délai d'inspection est un nombre fixe de jours, pas une négociation sans fin.

[Découvrez comment Bizik sécurise les ventes des entreprises](/fr/for-business), ou lisez [les 7 arnaques que nous voyons le plus souvent](/fr/blog/7-arnaques-en-ligne-au-cameroun-et-comment-le-sequestre-les-bloque) avant votre prochain gros achat.`,
  },
  {
    slug: 'mtn-momo-ou-orange-money-payer-en-ligne-en-securite',
    lang: 'fr',
    translationKey: 'mtn-momo-vs-orange-money-paying-safely-online',
    title: 'MTN MoMo ou Orange Money : payer en ligne en toute sécurité',
    excerpt:
      'Plafonds, réversibilité, frais et problème entre réseaux. Ce que chaque mobile money implique pour une transaction risquée, et comment utiliser l\'un ou l\'autre en sécurité.',
    seoTitle: 'MTN MoMo ou Orange Money : payer un inconnu en ligne en sécurité',
    seoDescription:
      'MTN Mobile Money et Orange Money sont rapides mais irréversibles. Comment payer un vendeur inconnu au Cameroun sans risque grâce au paiement sous séquestre.',
    category: 'money',
    categoryLabel: 'Argent',
    readMinutes: 4,
    publishedAt: '2026-09-18T08:00:00',
    body: `À eux deux, MTN Mobile Money et Orange Money font circuler l'essentiel des paiements du quotidien au Cameroun. Ils sont rapides, fonctionnent sur n'importe quel téléphone, et presque tout le monde en utilise au moins un. Mais ils n'ont jamais été conçus pour payer un inconnu pour quelque chose que vous n'avez pas encore reçu. Voici ce que chaque réseau fait bien, où il vous laisse exposé, et comment les utiliser en sécurité pour vos achats en ligne.

## Ce qu'ils ont en commun

Les deux sont instantanés. Les deux sont définitifs en pratique dès que l'argent est reçu et déplacé. Les deux facturent des frais qui augmentent avec le montant. Et les deux offrent très peu de recours si vous avez envoyé de l'argent à la mauvaise personne, ou à la bonne personne qui a ensuite disparu. Le service client peut parfois bloquer une transaction signalée dans les minutes qui suivent si l'argent n'a pas été retiré, mais un escroc retire tout de suite.

Autrement dit : le mobile money est un excellent moyen de déplacer de l'argent, et un mauvais moyen de le garder en attendant quelque chose.

## MTN MoMo

*   **Couverture :** le plus grand réseau du Cameroun, celui que la plupart des vendeurs demandent en premier.
*   **Plafonds :** les limites par jour et par opération dépendent de votre niveau de vérification. Si un gros paiement échoue, c'est souvent la raison.
*   **Réversibilité :** pratiquement aucune une fois les fonds reçus. Une annulation pour « mauvais numéro » n'est possible que si le destinataire n'a pas retiré et accepte, ou si vous joignez le support assez vite.
*   **Frais :** grille publiée par l'opérateur, qui change de temps en temps. Vérifiez avant de supposer.

## Orange Money

*   **Couverture :** le deuxième réseau, fort dans de nombreuses régions, souvent utilisé comme second compte pour éviter les pannes de l'autre réseau.
*   **Plafonds :** système par paliers similaire ; les comptes vérifiés ont des plafonds plus élevés.
*   **Réversibilité :** même chose, une fois reçu, c'est parti.
*   **Frais :** structure comparable à MoMo, également révisée de temps en temps.

## Le problème entre réseaux

Situation fréquente : l'acheteur a MoMo, le vendeur a Orange Money. Les transferts entre réseaux existent mais coûtent plus cher et échouent parfois, alors on finit par payer quelqu'un pour « changer », ou l'acheteur ouvre un deuxième compte, ou la vente tombe à l'eau.

## Le piège de la capture d'écran

L'arnaque au mobile money la plus courante n'a rien de technique. Un acheteur envoie la capture d'un transfert « réussi » et demande au vendeur de remettre l'article. La capture est retouchée, ou le transfert a été annulé juste après. Le vendeur qui remet un téléphone sur la foi d'une capture n'a aucun recours.

La seule règle sûre : faites confiance au solde, pas à l'image. Si l'argent n'est pas sur votre propre compte, ou visiblement bloqué pour vous sous séquestre, il n'a pas été payé.

## Utiliser l'un ou l'autre en sécurité pour une transaction risquée

Pour garder la rapidité du mobile money tout en supprimant le risque, placez un séquestre au milieu :

1.  L'acheteur verse le montant de la transaction sur le séquestre Bizik avec MTN MoMo ou Orange Money, celui qu'il a.
2.  Bizik confirme que l'argent est bien arrivé avant d'afficher la transaction comme financée. Aucune capture d'écran en jeu.
3.  Le vendeur expédie ou livre. L'acheteur inspecte.
4.  À la validation, le vendeur est payé sur son portefeuille Bizik et retire vers MTN MoMo ou Orange Money, celui qu'il a. Le problème entre réseaux disparaît, car chacun traite avec Bizik et non avec le réseau de l'autre.

Les frais Bizik sont affichés une seule fois, avant le paiement : l'acheteur paie les frais de séquestre, le vendeur ne paie rien sur la transaction. Les tarifs actuels sont sur la [page des tarifs](/fr/pricing).

## Petit guide de décision

*   **Vous payez quelqu'un que vous connaissez, un petit montant, en face à face :** utilisez directement MoMo ou Orange Money.
*   **Vous payez un inconnu, ou un montant qui vous manquerait, ou pour quelque chose qui arrivera plus tard :** payez sous séquestre avec MoMo ou Orange Money. Même téléphone, même rapidité, simplement conservé jusqu'à la fin de la transaction.

Lisez [ce qu'est le séquestre, expliqué simplement](/fr/blog/qu-est-ce-que-le-sequestre-explique-simplement), ou [voyez le parcours complet](/fr/how-it-works), du financement à la libération.`,
  },
  {
    slug: 'freelances-comment-etre-toujours-paye',
    lang: 'fr',
    translationKey: 'freelancers-how-to-make-sure-you-always-get-paid',
    title: 'Freelances : comment être sûr d\'être toujours payé',
    excerpt:
      'Jalons, étapes financées d\'avance, cahier des charges écrit et la manière polie de demander le séquestre à un nouveau client. Un guide pratique pour les freelances au Cameroun.',
    seoTitle: 'Freelance au Cameroun : comment être toujours payé',
    seoDescription:
      'Graphistes, développeurs, rédacteurs : comment découper vos missions en jalons financés d\'avance et ne plus jamais courir après un client au Cameroun.',
    category: 'freelancing',
    categoryLabel: 'Freelance',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `Demandez à n'importe quel freelance de Douala ou Yaoundé de parler de son pire client, vous entendrez la même histoire : le travail a été livré, le client a disparu, et le dernier paiement n'est jamais arrivé. Pas parce que le travail était mauvais, mais parce qu'une fois les fichiers en main, plus rien n'obligeait le client à payer. Voici comment organiser chaque mission pour que cela n'arrive plus.

## La règle : l'argent avant le travail, détenu par aucun des deux

Le vieux conseil, c'est « toujours prendre 50 % d'avance ». Cela aide, mais ne protège que la moitié du travail, et cela demande à un nouveau client de vous confier son argent avant d'avoir vu quoi que ce soit. Le séquestre règle les deux moitiés. Le client finance le montant complet (ou le jalon complet) avant que vous ne commenciez. Vous voyez qu'il est là. Il ne peut pas le reprendre. Vous livrez, il valide, vous êtes payé.

Aucun des deux n'a besoin de faire confiance à l'autre. Vous faites tous les deux confiance au processus.

## Découpez la mission en jalons

Pour toute mission de plus de quelques centaines de milliers de francs, ne faites pas une seule transaction. Découpez-la en étapes qui produisent chacune quelque chose que le client peut voir :

*   **Site web :** maquettes (30 %), version fonctionnelle (50 %), mise en ligne et remise (20 %).
*   **Identité visuelle :** pistes créatives (40 %), logo final et fichiers (40 %), charte graphique (20 %).
*   **Vidéo :** script et storyboard (25 %), premier montage (50 %), livraison finale (25 %).
*   **Rédaction :** plan (20 %), premier jet (50 %), version finale (30 %).

Chaque jalon est financé avant que vous ne le commenciez et libéré quand il est validé. Si le client disparaît après le deuxième jalon, vous avez été payé pour les deux premiers et vous vous arrêtez. Pas de travail impayé, pas de relances.

## Écrivez le cahier des charges dans la transaction

La plupart des litiges de paiement sont en réalité des litiges de périmètre : « ce n'est pas ce que j'ai demandé » contre « c'est exactement ce que vous avez demandé ». La solution est d'écrire le cahier des charges dans la transaction elle-même, pour qu'en cas de litige le médiateur ait une référence. Restez court et concret :

*   Ce qui est livré (site de cinq pages, trois pistes de logo, une vidéo de 90 secondes).
*   Le format (fichier Figma, PNG et SVG, MP4 en 1080p).
*   Le nombre de révisions incluses.
*   Le délai d'inspection, c'est-à-dire le nombre de jours dont dispose le client pour vérifier avant la libération.

Un client qui refuse un cahier des charges écrit veut garder la définition de « terminé » floue. Et ce flou ne joue jamais qu'en sa faveur.

## Comment demander le séquestre à un nouveau client (sans paraître méfiant)

Certains freelances craignent que demander le séquestre les fasse paraître méfiants. Présentez-le dans l'autre sens, cela protège aussi le client :

> « Je travaille avec le séquestre Bizik sur tous mes projets. Vous financez chaque étape avant que je commence, donc je sais que le budget est réel, et vous ne libérez le paiement qu'après avoir validé le travail, donc vous ne payez jamais pour quelque chose que vous n'avez pas vu. La mise en place prend deux minutes et je peux vous envoyer l'invitation maintenant. »

Les bons clients apprécient. Cela veut dire qu'eux non plus n'envoient pas d'argent à un inconnu. Ceux qui refusent catégoriquement sont souvent ceux que vous auriez fini par relancer.

## Et si le client dit que le travail ne convient pas ?

D'abord, il peut demander une révision : c'est prévu dans le processus, dans la limite des révisions convenues. Si la discussion échoue, il y a un litige. L'argent reste sous séquestre pendant qu'un médiateur Bizik compare ce que vous avez livré au cahier des charges de la transaction. Si vous avez livré ce qui était convenu, vous êtes payé. Sinon, le client est remboursé ou le montant est partagé. Dans tous les cas, la décision repose sur les preuves, pas sur celui qui s'entête le plus.

C'est ce qui change votre façon de travailler : vous arrêtez de baisser vos prix pour éviter les conflits et vous écrivez des cahiers des charges plus clairs.

## Être payé, puis retirer l'argent

Quand un jalon est libéré, l'argent arrive sur votre portefeuille Bizik. De là, vous le retirez vers MTN MoMo ou Orange Money. En tant que prestataire, vous ne payez pas de frais Bizik sur la transaction : ce sont les frais de séquestre de l'acheteur qui couvrent le service.

## Commencez avec la prochaine mission

Pas besoin de basculer tous vos clients dès le premier jour. Commencez avec le prochain nouveau client, découpez la mission en jalons, et voyez à quel point le projet est plus serein quand personne ne s'inquiète pour l'argent. [Découvrez Bizik pour les freelances](/fr/for-freelancers), ou consultez [les tarifs](/fr/pricing).`,
  },
  {
    slug: 'qu-est-ce-que-le-sequestre-explique-simplement',
    lang: 'fr',
    translationKey: 'what-is-escrow-in-plain-language',
    title: 'Qu\'est-ce que le séquestre, expliqué simplement ?',
    excerpt:
      'Qui garde l\'argent, quand il bouge, et ce qui se passe si la transaction échoue. Le paiement sous séquestre expliqué sans jargon, avec un exemple camerounais.',
    seoTitle: 'Paiement sous séquestre : définition simple et exemple au Cameroun',
    seoDescription:
      'Le séquestre (escrow) garde l\'argent de l\'acheteur jusqu\'à ce que le vendeur livre. Définition simple, étapes, litiges et frais, avec un exemple au Cameroun.',
    category: 'guides',
    categoryLabel: 'Guides',
    readMinutes: 4,
    publishedAt: '2026-09-18T08:00:00',
    body: `Vous avez trouvé le téléphone que vous voulez sur Facebook Marketplace. Le vendeur veut être payé d'abord. Vous voulez qu'il envoie d'abord. Aucun de vous ne connaît l'autre, et aucun ne veut être celui qui perd 180 000 XAF. C'est exactement le problème que le séquestre (en anglais, escrow) a été inventé pour résoudre.

## Le séquestre en une phrase

Le séquestre, c'est un tiers neutre qui garde l'argent jusqu'à ce que les deux parties aient fait ce qu'elles ont promis. L'acheteur paie le service de séquestre, pas le vendeur. Le vendeur voit que l'argent est vraiment là, alors il expédie ou commence le travail. Quand l'acheteur confirme avoir reçu la marchandise ou le travail, le service de séquestre verse l'argent au vendeur. Si quelque chose tourne mal, l'argent est toujours au milieu, en sécurité, et un médiateur peut décider de le rembourser ou de le partager.

C'est tout le principe. Le reste, ce sont des détails.

## Qui garde l'argent ?

Avec Bizik, l'argent est placé sur un compte de séquestre séparé, qui n'est pas mélangé aux fonds de l'entreprise et qu'aucune des deux parties ne peut dépenser. L'acheteur ne peut pas le reprendre sur un coup de tête, et le vendeur ne peut pas y toucher avant que la transaction soit terminée. Les deux voient à tout moment le montant et l'état de la transaction, depuis l'application, le site web ou l'assistant WhatsApp.

Cette visibilité change les comportements. Un vendeur qui voit 180 000 XAF bloqués pour lui expédie. Un acheteur qui sait que le vendeur ne touchera rien avant l'arrivée du téléphone paie.

## Quand l'argent bouge-t-il ?

Une transaction Bizik passe par quatre étapes :

1.  **Créée.** Une personne décrit la transaction : ce qui est vendu, le prix, la date de livraison et le nombre de jours dont l'acheteur dispose pour inspecter. L'autre personne accepte.
2.  **Financée.** L'acheteur paie sur le séquestre avec MTN MoMo, Orange Money ou son portefeuille Bizik. Le vendeur est prévenu dès que l'argent arrive.
3.  **Livrée.** Le vendeur expédie la marchandise ou livre le travail et le signale. Le délai d'inspection de l'acheteur commence.
4.  **Libérée.** L'acheteur valide, ou le délai d'inspection se termine sans litige, et l'argent part sur le portefeuille du vendeur. De là, il peut le retirer vers MTN MoMo ou Orange Money.

Pour les gros projets, la transaction peut être découpée en jalons, chacun financé et libéré séparément. C'est ainsi que les freelances utilisent Bizik pour un site web à 2 000 000 XAF sans que l'un des deux porte tout le risque d'un coup.

## Et si la transaction échoue ?

C'est la question la plus importante, car c'est la situation pour laquelle le séquestre existe. Si le téléphone n'arrive jamais, l'acheteur ouvre un litige depuis la transaction. L'argent reste gelé. Les deux parties déposent leurs preuves : numéros de suivi, photos, captures de discussion, annonce d'origine. Un médiateur Bizik les examine et rend une décision : paiement au vendeur, remboursement de l'acheteur ou partage du montant.

Personne n'a besoin de courir après qui que ce soit, ni de menacer qui que ce soit. Celui qui a tenu sa promesse reçoit l'argent, et ce sont les preuves qui décident, pas celui qui crie le plus fort.

## Ce que le séquestre n'est pas

*   **Ce n'est pas un prêt.** L'acheteur paie le montant complet dès le départ ; il est simplement conservé au lieu d'être remis.
*   **Ce n'est pas une assurance.** Le séquestre ne vous indemnise pas après coup ; il empêche l'argent de partir au mauvais moment.
*   **Ce n'est pas un portefeuille pour dépenser.** L'argent sous séquestre appartient à une transaction précise et ne peut aller qu'au vendeur ou revenir à l'acheteur.

## Combien ça coûte ?

Bizik prélève un petit pourcentage du montant de la transaction, payé par l'acheteur et affiché avant tout paiement. Le vendeur ne paie aucun frais sur la transaction. Pas d'abonnement, et rien à payer pour une transaction qui n'est jamais financée. Les tarifs actuels sont sur la [page des tarifs](/fr/pricing).

## Quand utiliser le séquestre ?

Chaque fois que vous traitez avec quelqu'un en qui vous n'avez pas encore confiance et que le montant ferait mal à perdre : téléphones et ordinateurs d'occasion, voitures, meubles, missions freelance, travaux. Si vous vous surprenez à écrire « tu peux envoyer la moitié d'abord ? », vous demandez déjà un séquestre, il vous manque juste le tiers neutre.

Prêt à essayer ? [Voyez exactement comment fonctionne une transaction Bizik](/fr/how-it-works), ou écrivez à Bizik sur WhatsApp pour créer votre première transaction en quelques minutes.`,
  },
  {
    slug: '7-arnaques-en-ligne-au-cameroun-et-comment-le-sequestre-les-bloque',
    lang: 'fr',
    translationKey: '7-online-scams-in-cameroon-and-how-escrow-stops-each-one',
    title: '7 arnaques en ligne au Cameroun - et comment le séquestre bloque chacune',
    excerpt:
      'Le vendeur qui réclame une avance, le faux livreur, le client qui paie à moitié et quatre autres. Où chaque arnaque se joue, et où le séquestre l\'arrête.',
    seoTitle: '7 arnaques en ligne au Cameroun et comment les éviter',
    seoDescription:
      'Avance « pour réserver », faux livreur, fausse capture MoMo, caution de location : les 7 arnaques en ligne les plus courantes au Cameroun et comment le séquestre les bloque.',
    category: 'scam-alerts',
    categoryLabel: 'Alertes arnaques',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `Presque toutes les arnaques en ligne ont la même forme. On demande à quelqu'un d'agir en premier (envoyer l'argent, expédier le téléphone, livrer la maquette) et l'autre partie ne tient simplement pas sa promesse. Les détails changent selon la saison, la structure jamais. Voici les sept que l'on rencontre le plus au Cameroun, et l'endroit précis où le séquestre casse chacune.

## 1. Le vendeur qui réclame une avance

Une annonce apparaît à un prix légèrement sous le marché. Le vendeur est aimable, répond vite, a de belles photos. Il demande une avance « pour réserver ». Une fois l'avance reçue, l'histoire change : des frais de douane, de transport, un problème avec le transporteur. Chaque nouveau frais paraît raisonnable par rapport à ce que vous avez déjà versé. Puis le numéro ne répond plus.

**Où le séquestre l'arrête :** il n'y a pas d'avance. Le prix complet est sous séquestre, le vendeur le voit, et il n'est payé que quand l'article est entre vos mains. Un vendeur qui refuse le séquestre pour un article « réservé » vous a tout dit.

## 2. Le faux livreur

Vous vous mettez d'accord avec un vendeur. Un troisième numéro rejoint la discussion, « le livreur », et vous demande des frais de livraison ou d'assurance avant de remettre le colis. Le livreur et le vendeur sont la même personne, ou des complices. Il n'y a jamais eu de colis.

**Où le séquestre l'arrête :** personne en dehors de la transaction ne peut vous demander d'argent. Le coût de livraison est convenu dans la transaction dès le départ, et le vendeur le récupère à la libération, pas auprès de vous dans une discussion parallèle. Nous avons détaillé cette arnaque dans [Le faux livreur est de retour](/fr/blog/faux-livreur-arnaque-comment-la-reconnaitre).

## 3. Le client qui paie à moitié

Un freelance reçoit une commande, convient d'un prix et demande 50 % d'avance. Le client paie. Le travail est livré. Les 50 % restants n'arrivent jamais : le client ne répond plus, ou trouve un petit défaut pour renégocier le solde jusqu'à zéro.

**Où le séquestre l'arrête :** le montant complet, ou le jalon complet, est financé avant le début du travail. Le freelance sait que l'argent existe. Le client ne peut pas le retenir ; il peut seulement ouvrir un litige, et un litige se décide sur les preuves, par rapport au cahier des charges convenu.

## 4. Le paiement MoMo annulé

Un acheteur paie par mobile money, récupère la marchandise, puis déclare la transaction comme une erreur pour la faire annuler. Ou il envoie une fausse capture « paiement reçu » et pousse le vendeur à remettre l'article sur-le-champ.

**Où le séquestre l'arrête :** le vendeur ne se fie jamais à une capture. Bizik confirme que l'argent est bien sous séquestre avant d'afficher la transaction comme financée, et une fois là, l'acheteur ne peut pas le reprendre seul. La libération se fait sur validation de l'acheteur ou à la fin du délai d'inspection.

## 5. L'article échangé

Vous examinez un téléphone, vous acceptez, vous payez, et le vendeur vous remet une boîte. Le téléphone dedans est un autre modèle, moins cher. Ou l'ordinateur « neuf » a une batterie changée et une carte mère fissurée sous un capot propre.

**Où le séquestre l'arrête :** le délai d'inspection. Vous disposez d'un nombre de jours convenu pour comparer ce que vous avez reçu à l'annonce avant que l'argent ne soit libéré. Si cela ne correspond pas, vous ouvrez un litige avec des photos, et l'argent reste gelé.

## 6. La caution de location qui disparaît

Une chambre ou un appartement est proposé. Le « bailleur » ne peut pas le faire visiter aujourd'hui, mais le garde pour vous si vous versez une caution. L'appartement appartient à quelqu'un d'autre, ou n'existe pas.

**Où le séquestre l'arrête :** la caution est versée sous séquestre et n'est libérée que lorsque vous confirmez avoir reçu les clés. Un vrai bailleur ne perd rien à accepter. Un faux ne peut pas accepter. Nous avons écrit un guide complet : [Louer à Douala ou Yaoundé : éviter l'arnaque à la caution](/fr/blog/louer-a-douala-ou-yaounde-eviter-l-arnaque-a-la-caution).

## 7. Le « cousin de confiance » de la diaspora

Une personne à l'étranger envoie de l'argent au pays pour payer un maçon, un mécanicien ou un fournisseur par l'intermédiaire d'un proche. Le proche dépense l'argent, ou le maçon est payé d'avance et ne revient plus. La personne à l'étranger n'a aucun moyen de vérifier.

**Où le séquestre l'arrête :** c'est vous qui êtes l'acheteur de la transaction, et le maçon ou le fournisseur est l'autre partie, pas le cousin. Un proche peut vous envoyer l'argent sur votre portefeuille Bizik pour financer la transaction, mais l'argent ne quitte le séquestre que sur votre validation, jalon par jalon, depuis votre téléphone, où que vous soyez.

## Le point commun

Chacune de ces arnaques repose sur une personne qui agit en premier pendant que l'autre détient tout le pouvoir. Le séquestre supprime ce moment. Personne n'agit en premier, parce que l'argent est chez un tiers neutre qui applique les règles acceptées par les deux parties. Si la personne avec qui vous traitez refuse de l'utiliser, ce refus est l'information la plus utile que vous obtiendrez.

[Voyez comment fonctionne une transaction Bizik étape par étape](/fr/how-it-works), ou lisez notre guide simple : [qu'est-ce que le séquestre](/fr/blog/qu-est-ce-que-le-sequestre-explique-simplement).`,
  },

  // ------------------------------------------------------------------
  // New articles, English and French
  // ------------------------------------------------------------------
  {
    slug: 'buying-on-whatsapp-and-facebook-marketplace-a-safety-checklist',
    lang: 'en',
    translationKey: 'buying-on-whatsapp-and-facebook-marketplace-a-safety-checklist',
    title: 'Buying on WhatsApp and Facebook Marketplace: a safety checklist',
    excerpt:
      'Twelve checks to run before you pay a seller you found on WhatsApp, a Facebook group or Marketplace in Cameroon, and the one payment rule that makes most scams impossible.',
    seoTitle: 'How to buy safely on WhatsApp and Facebook Marketplace in Cameroon',
    seoDescription:
      'A practical checklist for buying from strangers on WhatsApp and Facebook Marketplace in Cameroon: checking the seller, the item and the payment, plus how escrow protects you.',
    category: 'buying-selling',
    categoryLabel: 'Buying & selling',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `In Cameroon, a huge share of buying and selling now happens in WhatsApp chats, WhatsApp status updates and Facebook groups. It is fast and convenient, and most sellers are honest. But the platform gives you no protection at all: no buyer guarantee, no refund button, nobody to call when a seller stops answering. The protection has to come from how you buy. Here is the checklist.

## Check the seller

1.  **Look at the history, not the profile picture.** How long has the Facebook account existed? Does the seller have past posts, reviews in the group, or real friends commenting? A profile created last month with stock photos is a warning.
2.  **Ask for a video, not photos.** Photos can be downloaded from anywhere. A short video of the actual item, with today's date written on a piece of paper next to it, is hard to fake.
3.  **Call them.** A voice call tells you more than fifty messages. Scammers often avoid calls or always have "network problems".
4.  **Check the name on the payment number.** Before any money moves, the name registered on the mobile-money number should match the person you are talking to. If it is "my sister's number", ask why.

## Check the item

5.  **Compare the price.** Look at three or four similar listings. A price far below all of them is not luck; it is bait.
6.  **Ask the questions only an owner can answer.** How old is it, why are they selling, is there a receipt, any repairs? Vague or copied answers are a signal.
7.  **For phones and laptops:** ask for the IMEI or serial number and the storage and battery health screens. For phones, check the IMEI against the box.
8.  **Agree what "as described" means.** Write down the model, condition, colour, storage and what is included. This becomes your evidence if something goes wrong.

## Check the payment

9.  **Never pay a "reservation" deposit** for an item you have not seen. It is the most common entry point for advance-fee scams.
10.  **Never pay a third person** who appears mid-deal, such as a "delivery agent" or a "cousin" collecting on the seller's behalf.
11.  **Agree delivery cost up front**, inside the price. Fees that appear after you agreed are a red flag.
12.  **Do not let urgency decide.** "Another buyer is coming in an hour" is a sales tactic. A real seller can wait for you to pay safely.

## The one payment rule

Everything above reduces your risk. One rule removes most of it: **do not send money directly to a stranger for something you have not received.** Pay into escrow instead.

With Bizik, you create a deal with the seller (or they send you one), describe the item, the price, the delivery date and your inspection window, and pay into escrow with MTN MoMo or Orange Money. The seller sees that the money is really there and ships. You receive the item and check it. If it matches, you approve and the seller is paid. If it does not, you open a dispute with your evidence, and the money stays frozen until a Bizik mediator decides.

Escrow does not ask you to trust the seller. It asks the seller to trust the process, and a genuine seller has every reason to, because it also protects them from fake payment screenshots and reversed transfers.

## If the seller refuses escrow

Some honest sellers have simply never heard of it. Send them a short explanation: they get paid as soon as you confirm, they pay no fee on the deal, and they never have to worry about a fake screenshot again. If they still refuse, and insist that you send the money directly first, you have learned the most important thing about this deal.

## What escrow costs you

The escrow fee is a small percentage paid by the buyer, shown before you pay. The seller pays nothing. For a phone or a laptop, it is a fraction of what you could lose. The current rate is on the [pricing page](/pricing).

Read [the seven scams we see most often](/blog/7-online-scams-in-cameroon-and-how-escrow-stops-each-one), or [see how a Bizik deal works](/how-it-works).`,
  },
  {
    slug: 'acheter-sur-whatsapp-et-facebook-marketplace-sans-se-faire-arnaquer',
    lang: 'fr',
    translationKey: 'buying-on-whatsapp-and-facebook-marketplace-a-safety-checklist',
    title: 'Acheter sur WhatsApp et Facebook Marketplace sans se faire arnaquer',
    excerpt:
      'Douze vérifications à faire avant de payer un vendeur trouvé sur WhatsApp, un groupe Facebook ou Marketplace au Cameroun, et la règle de paiement qui rend la plupart des arnaques impossibles.',
    seoTitle: 'Acheter sur WhatsApp et Facebook Marketplace au Cameroun en sécurité',
    seoDescription:
      'La liste de vérifications pour acheter à un inconnu sur WhatsApp ou Facebook Marketplace au Cameroun : le vendeur, l\'article, le paiement, et comment le séquestre vous protège.',
    category: 'buying-selling',
    categoryLabel: 'Achat et vente',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `Au Cameroun, une grande partie des achats et des ventes se fait aujourd'hui dans les discussions WhatsApp, les statuts WhatsApp et les groupes Facebook. C'est rapide et pratique, et la plupart des vendeurs sont honnêtes. Mais ces plateformes ne vous protègent pas : pas de garantie acheteur, pas de bouton de remboursement, personne à appeler quand un vendeur ne répond plus. La protection doit venir de votre façon d'acheter. Voici la liste.

## Vérifiez le vendeur

1.  **Regardez l'historique, pas la photo de profil.** Depuis quand le compte Facebook existe-t-il ? Le vendeur a-t-il d'anciennes publications, des avis dans le groupe, de vrais amis qui commentent ? Un profil créé le mois dernier avec des photos d'illustration est un signal d'alerte.
2.  **Demandez une vidéo, pas des photos.** Une photo se télécharge n'importe où. Une courte vidéo de l'article réel, avec la date du jour écrite sur un papier à côté, est difficile à truquer.
3.  **Appelez-le.** Un appel en dit plus que cinquante messages. Les escrocs évitent souvent les appels ou ont toujours « un problème de réseau ».
4.  **Vérifiez le nom du numéro de paiement.** Avant que l'argent ne bouge, le nom enregistré sur le numéro de mobile money doit correspondre à la personne avec qui vous parlez. Si c'est « le numéro de ma sœur », demandez pourquoi.

## Vérifiez l'article

5.  **Comparez le prix.** Regardez trois ou quatre annonces similaires. Un prix très inférieur à toutes les autres n'est pas de la chance, c'est un appât.
6.  **Posez les questions auxquelles seul un propriétaire peut répondre.** Depuis quand l'a-t-il, pourquoi le vend-il, y a-t-il une facture, des réparations ? Des réponses vagues ou copiées sont un signal.
7.  **Pour les téléphones et ordinateurs :** demandez le numéro IMEI ou de série et les écrans de stockage et d'état de la batterie. Pour un téléphone, comparez l'IMEI avec celui de la boîte.
8.  **Mettez par écrit ce que « conforme » veut dire.** Modèle, état, couleur, stockage, accessoires inclus. C'est votre preuve si quelque chose se passe mal.

## Vérifiez le paiement

9.  **Ne payez jamais d'avance « pour réserver »** un article que vous n'avez pas vu. C'est la porte d'entrée la plus courante des arnaques à l'avance.
10.  **Ne payez jamais une tierce personne** qui apparaît en cours de route, comme un « livreur » ou un « cousin » qui encaisse pour le vendeur.
11.  **Convenez des frais de livraison dès le départ**, dans le prix. Des frais qui apparaissent après l'accord sont un signal d'alerte.
12.  **Ne laissez pas l'urgence décider.** « Un autre acheteur arrive dans une heure » est une technique de vente. Un vrai vendeur peut attendre que vous payiez en sécurité.

## La règle de paiement

Tout ce qui précède réduit votre risque. Une seule règle en supprime l'essentiel : **n'envoyez jamais d'argent directement à un inconnu pour quelque chose que vous n'avez pas reçu.** Payez sous séquestre.

Avec Bizik, vous créez une transaction avec le vendeur (ou il vous en envoie une), vous décrivez l'article, le prix, la date de livraison et votre délai d'inspection, puis vous payez sur le séquestre avec MTN MoMo ou Orange Money. Le vendeur voit que l'argent est vraiment là et expédie. Vous recevez l'article et le vérifiez. S'il est conforme, vous validez et le vendeur est payé. Sinon, vous ouvrez un litige avec vos preuves, et l'argent reste gelé jusqu'à la décision d'un médiateur Bizik.

Le séquestre ne vous demande pas de faire confiance au vendeur. Il demande au vendeur de faire confiance au processus, et un vendeur honnête a toutes les raisons de le faire, car cela le protège aussi des fausses captures de paiement et des transferts annulés.

## Si le vendeur refuse le séquestre

Certains vendeurs honnêtes n'en ont simplement jamais entendu parler. Envoyez-leur une courte explication : ils sont payés dès que vous confirmez, ils ne paient aucun frais sur la transaction, et ils n'auront plus jamais à se méfier d'une fausse capture. S'ils refusent encore et exigent que vous envoyiez l'argent directement, vous avez appris l'essentiel sur cette transaction.

## Ce que coûte le séquestre

Les frais de séquestre sont un petit pourcentage payé par l'acheteur, affiché avant le paiement. Le vendeur ne paie rien. Pour un téléphone ou un ordinateur, c'est une fraction de ce que vous pourriez perdre. Le tarif actuel est sur la [page des tarifs](/fr/pricing).

Lisez [les 7 arnaques les plus courantes au Cameroun](/fr/blog/7-arnaques-en-ligne-au-cameroun-et-comment-le-sequestre-les-bloque), ou [voyez comment fonctionne une transaction Bizik](/fr/how-it-works).`,
  },
  {
    slug: 'selling-on-whatsapp-how-to-get-strangers-to-trust-you',
    lang: 'en',
    translationKey: 'selling-on-whatsapp-how-to-get-strangers-to-trust-you',
    title: 'Selling on WhatsApp: how to get strangers to trust you and pay',
    excerpt:
      'Buyers in Cameroon have been burned before, so they hesitate to pay a seller they do not know. How to look credible, answer the "pay first?" standoff, and close more sales.',
    seoTitle: 'Selling on WhatsApp in Cameroon: how to build trust and close sales',
    seoDescription:
      'How WhatsApp and Instagram sellers in Cameroon can win the trust of new buyers, stop losing sales to the "who pays first" standoff and get paid safely with escrow.',
    category: 'buying-selling',
    categoryLabel: 'Buying & selling',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `If you sell clothes, phones, cosmetics, food or electronics through WhatsApp status, Instagram or Facebook groups, you already know the message that kills a sale: "I will pay when it arrives." The buyer is not being difficult. They, or someone they know, have paid a stranger before and never seen the goods. Your problem is not your product. It is that honest sellers and scammers look identical in a chat window. Here is how to stand out, and how to close the sale without either side taking the risk.

## Make yourself easy to check

*   **Use a WhatsApp Business profile** with your business name, a real address or area, opening hours and a catalogue. It costs nothing and it signals that you intend to be around next month.
*   **Show real stock, with your own hands.** Short videos of the actual items, filmed in your shop or home, are worth more than polished stock photos anyone can copy.
*   **Post delivered orders**, with the customer's permission: a photo of the parcel handed over, a thank-you message. It shows a history of completed sales, not just listings.
*   **Keep one number.** Changing numbers is exactly what scammers do. A stable number that has been selling for months is a quiet signal of trust.
*   **Answer calls.** A buyer who hears a real voice relaxes.

## Be precise about the item

Most disputes between honest people come from vague descriptions. For every item, state the exact model, size or capacity, condition (new, used, refurbished), colour, what is included and any defect. When a buyer asks a question, answer it in writing. Precision protects you: if a buyer later says "this is not what you described", your own description is the evidence.

## Put delivery in the price

Agree delivery cost and timing before the buyer pays, and include it in the total. Never ask for a separate fee afterwards, and never let a courier ask the buyer for money directly. Buyers in Cameroon are now trained, rightly, to treat a late delivery fee as a scam.

## Solve the "who pays first" standoff

Here is the real sticking point. You do not want to ship before you are paid, because buyers do disappear and fake payment screenshots are common. The buyer does not want to pay before receiving, for the same reasons in reverse. Cash on delivery helps in your own city, but it ties up your delivery rider, fails when the buyer changes their mind at the door, and does not work for orders to other towns.

Escrow ends the standoff. You create a deal on Bizik (from the app, the website or directly in WhatsApp), with the item, price and delivery date, and send it to the buyer. The buyer pays into escrow with MTN MoMo or Orange Money. You get a notification that the money is locked for you, not a screenshot but the real balance, and then you ship. When the buyer confirms receipt, or the inspection window ends without a dispute, the money is released to your Bizik wallet and you withdraw to MoMo or Orange Money.

The buyer is not trusting you any more. They are trusting the process, and that is a much easier thing to ask of a stranger.

## "Pay safely with Bizik" as a selling point

Sellers who offer escrow tend to use it as part of their pitch rather than as a last resort. A line on your status or catalogue such as "Pay safely with Bizik escrow: your money is only released when you receive your order" answers the buyer's biggest fear before they have to ask. And because the escrow fee is paid by the buyer, not by you, offering it does not eat into your margin.

## When a buyer disputes

Most deals end with a simple approval. If a buyer does open a dispute, the money stays in escrow while both sides submit evidence. This is where the habits above pay off: your written description, your video of the item, your delivery photo and your chat history are exactly what a Bizik mediator looks at. Sellers who describe precisely and document delivery rarely lose a dispute they should win.

## Start with your next new customer

You do not need to change how you sell to regular customers who already trust you. Offer escrow to the new ones, the buyers who ask "can I pay when it arrives?". Those are the sales you are losing today.

[See how Bizik works for businesses](/for-business), or read [the buyer's safety checklist](/blog/buying-on-whatsapp-and-facebook-marketplace-a-safety-checklist) your customers are reading.`,
  },
  {
    slug: 'vendre-sur-whatsapp-gagner-la-confiance-des-inconnus',
    lang: 'fr',
    translationKey: 'selling-on-whatsapp-how-to-get-strangers-to-trust-you',
    title: 'Vendre sur WhatsApp : gagner la confiance des inconnus et être payé',
    excerpt:
      'Les acheteurs au Cameroun se sont déjà fait avoir, alors ils hésitent à payer un vendeur inconnu. Comment inspirer confiance, sortir du blocage « qui paie en premier » et conclure plus de ventes.',
    seoTitle: 'Vendre sur WhatsApp au Cameroun : inspirer confiance et conclure',
    seoDescription:
      'Comment les vendeurs WhatsApp et Instagram au Cameroun peuvent rassurer les nouveaux acheteurs, sortir du blocage « qui paie en premier » et être payés en sécurité grâce au séquestre.',
    category: 'buying-selling',
    categoryLabel: 'Achat et vente',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `Si vous vendez des vêtements, des téléphones, des cosmétiques, de la nourriture ou de l'électronique via vos statuts WhatsApp, Instagram ou des groupes Facebook, vous connaissez le message qui fait échouer une vente : « Je paie à la livraison. » L'acheteur n'est pas de mauvaise foi. Lui, ou quelqu'un de son entourage, a déjà payé un inconnu sans jamais recevoir la marchandise. Votre problème n'est pas votre produit. C'est que, dans une discussion, un vendeur honnête et un escroc se ressemblent. Voici comment vous démarquer, et comment conclure la vente sans que personne ne prenne le risque.

## Rendez-vous facile à vérifier

*   **Utilisez un profil WhatsApp Business** avec le nom de votre activité, une adresse ou un quartier réel, vos horaires et un catalogue. C'est gratuit, et cela montre que vous serez encore là le mois prochain.
*   **Montrez votre vrai stock, de vos propres mains.** De courtes vidéos des articles réels, filmées dans votre boutique ou chez vous, valent plus que de belles photos que n'importe qui peut copier.
*   **Publiez les commandes livrées**, avec l'accord du client : une photo du colis remis, un message de remerciement. Cela montre un historique de ventes terminées, pas seulement des annonces.
*   **Gardez un seul numéro.** Changer de numéro, c'est exactement ce que font les escrocs. Un numéro stable qui vend depuis des mois inspire confiance.
*   **Répondez aux appels.** Un acheteur qui entend une vraie voix se détend.

## Soyez précis sur l'article

La plupart des litiges entre personnes honnêtes viennent de descriptions floues. Pour chaque article, indiquez le modèle exact, la taille ou la capacité, l'état (neuf, occasion, reconditionné), la couleur, ce qui est inclus et tout défaut. Quand un acheteur pose une question, répondez par écrit. La précision vous protège : si un acheteur dit plus tard « ce n'est pas ce que vous aviez décrit », votre propre description est la preuve.

## Incluez la livraison dans le prix

Convenez du coût et du délai de livraison avant que l'acheteur ne paie, et incluez-les dans le total. Ne demandez jamais de frais séparés après coup, et ne laissez jamais un livreur réclamer de l'argent directement à l'acheteur. Les acheteurs au Cameroun ont appris, à juste titre, à considérer des frais de livraison tardifs comme une arnaque.

## Sortez du blocage « qui paie en premier »

Voilà le vrai point de friction. Vous ne voulez pas expédier avant d'être payé, parce que des acheteurs disparaissent et que les fausses captures de paiement sont courantes. L'acheteur ne veut pas payer avant de recevoir, pour les mêmes raisons dans l'autre sens. Le paiement à la livraison aide dans votre ville, mais il immobilise votre livreur, échoue quand l'acheteur change d'avis à la porte, et ne fonctionne pas pour les autres villes.

Le séquestre met fin au blocage. Vous créez une transaction sur Bizik (depuis l'application, le site ou directement sur WhatsApp) avec l'article, le prix et la date de livraison, et vous l'envoyez à l'acheteur. L'acheteur paie sur le séquestre avec MTN MoMo ou Orange Money. Vous recevez une notification indiquant que l'argent est bloqué pour vous, pas une capture mais le vrai solde, et vous expédiez. Quand l'acheteur confirme la réception, ou quand le délai d'inspection se termine sans litige, l'argent est versé sur votre portefeuille Bizik et vous le retirez vers MoMo ou Orange Money.

L'acheteur ne vous fait plus confiance à vous. Il fait confiance au processus, et c'est beaucoup plus facile à demander à un inconnu.

## « Payez en sécurité avec Bizik » comme argument de vente

Les vendeurs qui proposent le séquestre en font un argument plutôt qu'un dernier recours. Une phrase dans votre statut ou votre catalogue, comme « Payez en sécurité avec le séquestre Bizik : votre argent n'est libéré qu'à la réception de votre commande », répond à la plus grande peur de l'acheteur avant même qu'il ne la formule. Et comme les frais de séquestre sont payés par l'acheteur, pas par vous, le proposer ne réduit pas votre marge.

## Quand un acheteur ouvre un litige

La plupart des transactions se terminent par une simple validation. Si un acheteur ouvre un litige, l'argent reste sous séquestre pendant que les deux parties déposent leurs preuves. C'est là que les habitudes ci-dessus paient : votre description écrite, votre vidéo de l'article, votre photo de livraison et l'historique de la discussion sont exactement ce qu'examine un médiateur Bizik. Les vendeurs qui décrivent avec précision et documentent la livraison perdent rarement un litige qu'ils devraient gagner.

## Commencez avec votre prochain nouveau client

Inutile de changer votre façon de vendre à vos clients fidèles. Proposez le séquestre aux nouveaux, ceux qui demandent « je peux payer à la réception ? ». Ce sont les ventes que vous perdez aujourd'hui.

[Découvrez Bizik pour les entreprises](/fr/for-business), ou lisez [la liste de vérifications que vos acheteurs lisent](/fr/blog/acheter-sur-whatsapp-et-facebook-marketplace-sans-se-faire-arnaquer).`,
  },
  {
    slug: 'renting-in-douala-or-yaounde-how-to-avoid-the-deposit-scam',
    lang: 'en',
    translationKey: 'renting-in-douala-or-yaounde-how-to-avoid-the-deposit-scam',
    title: 'Renting in Douala or Yaoundé: how to avoid the deposit scam',
    excerpt:
      'Fake landlords, fake agents and apartments that do not exist. How the rental deposit scam works in Cameroon, what to check before paying anything, and how to hold the deposit safely.',
    seoTitle: 'Rental deposit scams in Douala and Yaoundé: how to avoid them',
    seoDescription:
      'Looking for an apartment or studio in Douala or Yaoundé? How the fake-landlord deposit scam works, what to check before paying, and how to pay the deposit through escrow.',
    category: 'scam-alerts',
    categoryLabel: 'Scam alerts',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `Finding a room, studio or apartment in Douala or Yaoundé is hard enough. Good places go fast, and landlords often ask for several months of rent in advance plus a deposit. Scammers know this. They post attractive listings at fair prices, create urgency, and collect "reservation fees" and deposits for homes they do not own. Here is how the scam works and how to protect yourself.

## How the deposit scam works

The listing looks normal: clear photos, a reasonable rent, a good neighbourhood. The "landlord" or "agent" is friendly and responsive, but cannot show the place today. They are travelling, or the current tenant is still inside, or another viewer is coming tomorrow. To "hold" it for you, they ask for a reservation fee or part of the deposit by mobile money. Sometimes they send a photo of an ID card or a "contract" to look official.

Once the money arrives, one of three things happens: the number goes silent, a new fee appears (a "contract fee", a "key fee"), or you arrive at the address to find someone else living there, sometimes alongside other people who paid the same "landlord".

Variations include genuine agents who collect visit fees for places that are already let, and real tenants who sublet a place they are about to leave, collecting several deposits from several people.

## Before you pay anything

*   **Visit in person, or send someone you trust.** Never pay for a place nobody you know has seen. If you are not in the city, ask a friend or relative to visit.
*   **Meet the owner, or see the mandate.** If an agent is involved, ask to see written authority from the owner, and ask to speak to the owner directly.
*   **Check that the keys work.** During the visit, the person showing the place should open it with their own keys, not have it "opened by the caretaker".
*   **Ask the neighbours.** A two-minute conversation with a neighbour or the building caretaker about who owns the place is the cheapest check there is.
*   **Compare prices.** A three-bedroom in a sought-after area at the price of a studio is bait.
*   **Get a written lease** that names the owner, the property, the rent, the deposit, the advance and the start date, signed by both sides.

## Never pay a "reservation fee" by mobile money

The single most useful rule: do not send a reservation fee or deposit by mobile money to someone you have not met, for a place you have not seen. Once received, a mobile-money transfer is effectively final, and scammers withdraw immediately.

## Hold the deposit in escrow

If you are ready to commit but not ready to hand money to a stranger, put the deposit or the advance into escrow. On Bizik, you create a deal with the landlord or agent: the property, the amount, the move-in date and a short inspection window. You fund it with MTN MoMo or Orange Money. The landlord sees that the money is really there and locked for them. When you receive the keys and the place matches what was agreed, you approve and they are paid. If the keys never come, or the place is not what was promised, you open a dispute and the money stays frozen until a Bizik mediator reviews the evidence.

A genuine landlord loses nothing by accepting this. They still receive the full amount, and they know you are serious. A fake landlord cannot accept it, because they have no keys to hand over. That refusal alone tells you what you need to know.

## If you have already paid

Report the transaction to your mobile-money provider at once; if the money has not been withdrawn, a freeze may still be possible. Keep screenshots of the listing, the chat and the numbers used, and report the case to the police and to the platform where the listing appeared. Warn others in the same group: these scammers usually post the same listing several times.

[See how a Bizik deal works](/how-it-works), or read [the seven online scams we see most often in Cameroon](/blog/7-online-scams-in-cameroon-and-how-escrow-stops-each-one).`,
  },
  {
    slug: 'louer-a-douala-ou-yaounde-eviter-l-arnaque-a-la-caution',
    lang: 'fr',
    translationKey: 'renting-in-douala-or-yaounde-how-to-avoid-the-deposit-scam',
    title: 'Louer à Douala ou Yaoundé : éviter l\'arnaque à la caution',
    excerpt:
      'Faux bailleurs, faux démarcheurs et appartements qui n\'existent pas. Comment fonctionne l\'arnaque à la caution au Cameroun, quoi vérifier avant de payer, et comment verser la caution en sécurité.',
    seoTitle: 'Arnaque à la caution à Douala et Yaoundé : comment l\'éviter',
    seoDescription:
      'Vous cherchez un studio ou un appartement à Douala ou Yaoundé ? Comment fonctionne l\'arnaque du faux bailleur, quoi vérifier avant de payer, et comment verser la caution sous séquestre.',
    category: 'scam-alerts',
    categoryLabel: 'Alertes arnaques',
    readMinutes: 5,
    publishedAt: '2026-09-18T08:00:00',
    body: `Trouver une chambre, un studio ou un appartement à Douala ou Yaoundé est déjà difficile. Les bons logements partent vite, et les bailleurs demandent souvent plusieurs mois d'avance en plus de la caution. Les escrocs le savent. Ils publient des annonces attrayantes à des prix corrects, créent de l'urgence, et encaissent des « frais de réservation » et des cautions pour des logements qui ne leur appartiennent pas. Voici comment fonctionne l'arnaque et comment vous protéger.

## Comment fonctionne l'arnaque à la caution

L'annonce paraît normale : photos nettes, loyer raisonnable, bon quartier. Le « bailleur » ou le « démarcheur » est aimable et répond vite, mais ne peut pas faire visiter aujourd'hui. Il est en voyage, ou l'ancien locataire est encore là, ou un autre visiteur passe demain. Pour vous « garder » le logement, il demande des frais de réservation ou une partie de la caution par mobile money. Parfois, il envoie la photo d'une carte d'identité ou d'un « contrat » pour paraître sérieux.

Une fois l'argent reçu, trois scénarios : le numéro ne répond plus, de nouveaux frais apparaissent (« frais de contrat », « frais de clés »), ou vous arrivez à l'adresse pour y trouver quelqu'un d'autre, parfois avec d'autres personnes qui ont payé le même « bailleur ».

Il existe aussi des variantes : de vrais démarcheurs qui encaissent des frais de visite pour des logements déjà loués, ou de vrais locataires qui « sous-louent » un logement qu'ils s'apprêtent à quitter en encaissant plusieurs cautions auprès de plusieurs personnes.

## Avant de payer quoi que ce soit

*   **Visitez en personne, ou envoyez quelqu'un de confiance.** Ne payez jamais un logement que personne de votre entourage n'a vu. Si vous n'êtes pas en ville, demandez à un ami ou un parent de le visiter.
*   **Rencontrez le propriétaire, ou voyez le mandat.** Si un démarcheur intervient, demandez à voir l'autorisation écrite du propriétaire, et demandez à parler au propriétaire directement.
*   **Vérifiez que les clés fonctionnent.** Pendant la visite, la personne qui fait visiter doit ouvrir avec ses propres clés, pas faire ouvrir « par le gardien ».
*   **Interrogez les voisins.** Deux minutes de conversation avec un voisin ou le gardien sur le propriétaire du logement, c'est la vérification la moins chère qui soit.
*   **Comparez les prix.** Un trois-chambres dans un quartier recherché au prix d'un studio, c'est un appât.
*   **Exigez un bail écrit** qui mentionne le propriétaire, le logement, le loyer, la caution, l'avance et la date d'entrée, signé par les deux parties.

## Ne payez jamais de « frais de réservation » par mobile money

La règle la plus utile : n'envoyez ni frais de réservation ni caution par mobile money à quelqu'un que vous n'avez pas rencontré, pour un logement que vous n'avez pas vu. Une fois reçu, un transfert mobile money est définitif en pratique, et les escrocs retirent tout de suite.

## Placez la caution sous séquestre

Si vous êtes prêt à vous engager sans être prêt à remettre de l'argent à un inconnu, placez la caution ou l'avance sous séquestre. Sur Bizik, vous créez une transaction avec le bailleur ou le démarcheur : le logement, le montant, la date d'entrée et un court délai d'inspection. Vous la financez avec MTN MoMo ou Orange Money. Le bailleur voit que l'argent est vraiment là et bloqué pour lui. Quand vous recevez les clés et que le logement correspond à ce qui était convenu, vous validez et il est payé. Si les clés n'arrivent jamais, ou si le logement n'est pas celui promis, vous ouvrez un litige et l'argent reste gelé jusqu'à ce qu'un médiateur Bizik examine les preuves.

Un vrai bailleur ne perd rien à accepter : il reçoit le montant complet et sait que vous êtes sérieux. Un faux bailleur ne peut pas accepter, puisqu'il n'a pas de clés à remettre. Ce refus suffit à vous renseigner.

## Si vous avez déjà payé

Signalez immédiatement la transaction à votre opérateur de mobile money ; si l'argent n'a pas été retiré, un blocage est peut-être encore possible. Gardez des captures de l'annonce, de la discussion et des numéros utilisés, et signalez les faits à la police et à la plateforme où l'annonce a été publiée. Prévenez les membres du même groupe : ces escrocs publient souvent la même annonce plusieurs fois.

[Voyez comment fonctionne une transaction Bizik](/fr/how-it-works), ou lisez [les 7 arnaques en ligne les plus courantes au Cameroun](/fr/blog/7-arnaques-en-ligne-au-cameroun-et-comment-le-sequestre-les-bloque).`,
  },
];
