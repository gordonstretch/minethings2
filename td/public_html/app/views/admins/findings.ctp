<?
echo "<table>";
foreach($findings as $f)
{
	if (isset($f['url']))
		$finding = $html->link($f['finding'], $f['url']);
	else
		$finding = $f['finding'];
	if (isset($f['rarity']))
		$finding = array($finding, array('bgcolor' => $rarityColors[$f['rarity']-1]));
	

	$row = array(
		$html->link($f['minerName'], '/miners/profile/'.$f['minerName']), 
		$finding,
		$f['created']);
	echo $html->tableCells(array($row));
}
echo "</table>";
?>