<?
if (isset($error))
	echo '<p>'.$error.'</p>';
?>

<table>
<?
foreach($boxCounts as $box)
{
	$cannonball = array_shift($crateCounts);
	$link = $ajax->link('Open '.$box['name'], 'js_open_box/'.$box['type'], array('update' => 'TableDiv'));
	
	echo $html->tableCells(array(array(
		$box['count'].'x '.$html->link($box['name'], '/items/view/'.$box['id']),
		$cannonball['count'].'x '.$html->link($cannonball['name'], '/items/view/'.$cannonball['id']),
		$link,
		)));
}
?>
</table>
	