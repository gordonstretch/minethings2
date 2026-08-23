<div id="fullcenter">
<?
foreach($routes as $r)
{
	echo '<h3>'.$r['City1']['name'].' to '.$r['City2']['name'].' ('.$r['Route']['typeName'].' - '.$r['Route']['length'].'km)</h3>';

	echo $form->create('Route', array('url' => '/admins/routes'));
	echo $form->input('id', array('type' => 'hidden', 'value' => $r['Route']['id']));
	echo $form->input('open', array('type' => 'hidden', 'value' => $r['Route']['open']));
	echo $form->end($r['Route']['open'] ? 'Close' : 'Open');
	
	foreach($r['MinersVehicle'] as $mv)
	{
		echo $html->link($mv['id'], '/vehicles/check_status/'.$mv['id']).' ';
	}
}
?>