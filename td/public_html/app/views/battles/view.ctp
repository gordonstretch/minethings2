<div id="fullcenter">

<H2>Battle Report</H2>


<? 
$noun = ($details['type'] == 'land2') ? 'vehicle' : 'ship';
if ($aggressive and $enemyAggressive)
	echo "Both {$noun}s were aggressive toward one another.<BR>";
else if ($aggressive)
	echo "Your {$noun} was aggressive and your enemy's was defensive.<BR>";
else 
	echo "Your {$noun} was defensive and your enemy's was aggressive.<BR>";
?>

<? if ($details['type'] == 'land'): ?>

<? 
if ($aggressive and $enemyAggressive)
{
	$combined = $details['offense'] + $details['defense'];
	echo "Both vehicles were aggressive toward one another and used their combined offense and defense.<BR>";
	echo "Your vehicle's offense+defense was $combined (incl. $meldBoost meld boost).";
}
else if ($aggressive)
{
	echo "Your vehicle was aggressive and your enemy's was defensive.<BR>";
	echo "Your vehicle used its ".$details['offense']." offense against the enemy's defense.";
}
else 
{
	echo "Your vehicle was defensive and your enemy's was aggressive.<BR>";
	echo "Your vehicle used its ".$details['defense']." defense (incl. ".$details['meldBoost']." meld boost) against the enemy's offense.";
}
?>
<BR>

<? else: if ($details['type'] == 'land2'): ?>

<?
echo "Your vehicle started the battle with ";
foreach(array('attack', 'armor', 'offense', 'defense', 'dodge') as $field)
	$descriptions[] = $details['stats']['starting_'.$field]." $field";
$descriptions[4] = "and ".$descriptions[4];
echo join($descriptions, ', ').'.<BR>';

echo "After ".$details['stats']['rounds']." rounds ";
if ($won)
	echo "your vehicle dealt a final blow of ".$details['stats']['final_blow']." damage and finished ";
else
	echo "your vehicle suffered a final blow of ".$details['stats']['final_blow']." damage leaving it ";
echo "with ".$details['stats']['ending_attack']." attack and ".$details['stats']['ending_armor']." armor remaining."
?>


<? else: if ($details['type'] == 'ship'): ?>

<?

if (count($details['cannonShots']))
{
	$hull = $details['friendlyStats']['starting_hull'];
	$speed = $details['friendlyStats']['starting_speed'];
	$crew = $details['friendlyStats']['starting_crew'];

	echo "<H3>Cannon Battle</H3>";
	foreach($details['cannonShots'] as $round => $portals)
	{
		echo "<BR><b>Round $round</b>";
		echo '<table>';
		echo $html->tableHeaders(array('', 'Friendly Shots', 'Enemy Shots', 'Your Ship'));

		foreach($portals as $portal => $shots)
		{
			$row = array();
			$row[] = $portal;
			$row[] = $cannon->CannonHit($shots, 'Friendly');
			$row[] = $cannon->CannonHit($shots, 'Enemy');
			if (isset($shots['Enemy']) and $shots['Enemy']['hit'])
			{
				$stat = null;
				switch($shots['Enemy']['shotType'])
				{
					case 1: $stat = &$hull; break;
					case 2: $stat = &$speed; break;
					case 3: $stat = &$crew; break;
				}
				if ($stat)
					$stat = max(0, $stat - $shots['Enemy']['damage']);
				unset($stat);
			}
			$row[] = "Hull: $hull Speed: $speed Crew: $crew";
			echo $html->tableCells(array($row));	
		}
		echo '</table>';
	}
}
?>
<BR>

<H3>Crew Battle</H3>

<?

function WeaponsToString($weapons, $weaponIcons, $html)
{
	$strings = array();
	foreach($weapons as $w)
		if ($w)
			$strings[] = $html->image($weaponIcons[$w['rarity']]).'&nbsp;'.$w['name'].' wielder'; //$itemList->ItemIcon($w['rarity'])." ".$w['name']." wielder";
	$unarmed = count($weapons) - count($strings);
	if ($unarmed)
		$strings[] = "$unarmed unarmed fighters";
	if (count($strings))
		return implode(', ', $strings);
	else
		return false;
}

if (count($details['friendlyWeapons']) or count($details['enemyWeapons']))
{

	if ($details['friendlyStats']['fighting_crew_strength'] == $details['friendlyStats']['fighting_crew'])
		echo "The ship's crew of ".$details['friendlyStats']['fighting_crew']." fought with no weapons";
	else
		echo "The ship's crew of ".$details['friendlyStats']['fighting_crew']." picked up their weapons and fought with a strength of ".$details['friendlyStats']['fighting_crew_strength'];
	echo " against the enemy's ".$details['enemyFightingCrewStrength']." strength.<BR>";


	$string = WeaponsToString($details['friendlyWeapons'], $weaponIcons, $html);
	if ($string)
		echo "<BR>Casualties from your crew: ".$string.'.<BR>';

	$string = WeaponsToString($details['enemyWeapons'], $weaponIcons, $html);
	if ($string)
		echo "<BR>Casualties from the enemy crew: ".$string.'.<BR>';

	echo '<br>';

	echo "The battle ended when the ship's crew of ".$details['friendlyStats']['ending_crew']." had a strength of ".$details['friendlyStats']['ending_crew_strength']." against the enemy's strength of ".$details['enemyEndingCrewStrength'].".";
}
else if ($details['friendlyStats']['ending_hull'] == 0)
	echo "The ship's crew of ".$details['friendlyStats']['fighting_crew']." had a strength of ".$details['friendlyStats']['fighting_crew_strength']." and they all drowned.";
else if ($details['chainEscape'])
{
	if ($won)
		echo "<BR><BR>Your ship did enough damage to the enemy sails to allow its escape.  No crew boarded your ship.";
	else
		echo "<BR><BR>Your ship's sails were damaged by the enemy cannons and did not have the speed needed to board their ship."; 
}
else
	echo "<BR><BR>The ship's crew of ".$details['friendlyStats']['fighting_crew']." had a strength of ".$details['friendlyStats']['fighting_crew_strength']." and did not fight the enemy's crew of strength ".$details['enemyFightingCrewStrength'].".";
?>

<? endif; endif; endif; ?>

<BR><BR>
<?
if ($details['type'] == 'ship' and $details['enemyEndingHull'] == 0)
	echo 'You sank them';
else if ($won)
	echo '<B>You won.</B>';
else if ($tied)
	echo '<B>You tied.</B>';
else
	echo '<B>You lost.</B>';

echo "<BR><BR>";

if ($details['type'] == 'ship')
{
	if ($details['crewHealed'] or $details['hullRepaired'] or $details['speedRepaired'])
	{
		$events = array();
		if ($details['crewHealed'])
			$events[] = $details['crewHealed']." crew members were revived";
		if ($details['hullRepaired'])
			$events[] = $details['hullRepaired']." hull was repaired";
		if ($details['speedRepaired'])
			$events[] = "sails were mended restoring ".$details['speedRepaired']." speed";
		if (count($events) > 1)
			$events[count($events)-1] = "and ".$events[count($events)-1]; // add "and"
		echo 'After the battle was over, '.implode(', ', $events).".";
	}
}

?>

</div>
