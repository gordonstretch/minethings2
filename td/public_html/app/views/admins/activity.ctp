<?
echo "<table>";
foreach($items as $i)
{
	$row = array(
		$html->link($i['minerName'], '/miners/profile/'.$i['minerName']), 
		$html->link($i['itemName'], '/items/view/'.$i['itemId']),
		$i['created']);
	echo $html->tableCells(array($row));
}
echo "</table>";
?>