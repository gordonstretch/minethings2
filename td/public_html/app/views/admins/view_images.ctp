<table>
<?

foreach($images as $i)
{
	$link = $html->link($i['itemName']." by ".$i['minerName'], '/images/submit/'.$i['itemId']);
	$created = $i['created'];
	echo $html->tableCells(array(array($html->image($i['filename']), $link, $created)));
}
?>

</table>
