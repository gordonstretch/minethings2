			<div style="position:relative; z-index:10;">
				<div id="citiesmenu" style="display:none; position:absolute; top:0px; left:-2px;">
				<table width=200 border=1 bgcolor="#804E0F">
				<?
					$menuItems = array();
					$ajaxCities = false;
					if (isset($menuCities)) #per-page override
					{
						$_menuCities = $menuCities;
						$ajaxCities = true;
					}
					foreach($_menuCities as $c => $link)
						if ($ajaxCities)
							$menuItems[] = $ajax->link($c, $link, array(
								'onclick' => '$("citiesmenu").hide();',
								'indicator' => 'LoadingDiv',
								'update' => 'content',
								'class' => 'menuitem'));
						else if ($link)
							$menuItems[] = $html->link($c, $link, array('class' => 'menuitem'));
						else 
							$menuItems[] = '<font style="color:white;">'.$c.'</font>';
					$dim = Configure::read('Minethings.map_dimensions');
					$width = $dim[0]; $height = $dim[1];
					$menuItems[] = $html->link('Map', '/miners/map/'.$redirect, array( 
						'class' => 'lightview menuitem',
						'title' => "Map :: :: autosize: true, width: $width, height: $height",
						'rel' => 'iframe',
						'OnClick' => '$("citiesmenu").hide();',
						));
					$menuItems[] = $html->link('Change Server', $changeServerUrl, array('class' => 'menuitem'));
					foreach($menuItems as $m)
						echo $html->tableCells(array($m));
				?>
				</table>
				</div>
			</div>
