<?
echo "$activeMiners Active Miners<br>";
echo "$pulls Pulls<br>";

echo "<table border=1>";
foreach($entries as $entry)
{
	echo $html->tableCells(array( array(
		$html->link($entry['name'], '/miners/profile/'.$entry['name']),
		$entry['ip'],
		$entry['created']
	)));
}
echo "</table>";

?>